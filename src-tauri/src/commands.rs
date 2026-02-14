use base64::Engine;
use chrono::Local;
use open;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

// ── Types ──

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SfModel {
    pub id: String,
    pub name: String,
    pub pricing: String,
    pub modes: Vec<String>,
    pub input_price: f64,
    pub output_price: f64,
    pub free: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub modes: Vec<String>,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_per_day: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_today: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voucher: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charge_balance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_balance: Option<String>,
}

#[derive(Serialize)]
pub struct SettingsResponse {
    pub has_key: bool,
    pub has_simpletex: bool,
    pub simpletex_model: String,
    pub simpletex_models: Vec<SimpleTexModelInfo>,
    pub simpletex_usage_by_model: HashMap<String, u32>,
    pub sf_balance: Option<String>,
    pub sf_charge_balance: Option<String>,
    pub voucher_models: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct SimpleTexModelInfo {
    pub id: String,
    pub name: String,
    pub free_per_day: u32,
}

#[derive(Serialize)]
pub struct AvailableModelsResponse {
    pub models: Vec<AvailableModel>,
    pub sf_balance: Option<String>,
    pub sf_charge_balance: Option<String>,
    pub voucher_balance: Option<String>,
}

#[derive(Serialize)]
pub struct RecognizeResponse {
    pub text: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrected: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
}

#[derive(Serialize)]
pub struct TestResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<String>,
}

#[derive(Serialize)]
pub struct BalanceResponse {
    pub charge_balance: Option<String>,
    pub total_balance: Option<String>,
    pub voucher_balance: Option<String>,
}

// ── Constants ──

const SILICONFLOW_API_URL: &str = "https://api.siliconflow.cn/v1/chat/completions";

const SIMPLETEX_MODELS: &[(&str, &str, u32, &str)] = &[
    ("latex_ocr", "SimpleTex 标准模型", 500, "formula"),
    ("latex_ocr_turbo", "SimpleTex 轻量模型", 2000, "formula"),
    ("simpletex_ocr", "SimpleTex 通用识别", 50, "document"),
];

fn get_prompt(mode: &str) -> &'static str {
    match mode {
        "formula" => "请识别图片中的数学公式，只返回纯LaTeX代码，不要用markdown代码块包裹，不要加$符号，不要解释。",
        "ocr" => "请识别图片中的所有文字内容，保持原始排版格式。只返回识别到的文字，不要解释。",
        "document" => "请识别图片中的所有内容（包括文字、公式、表格等），以Markdown格式返回。公式用$...$（行内）或$$...$$（块级）包裹，表格用Markdown表格语法，保持原始排版结构。不要解释。",
        _ => "请识别图片中的数学公式，只返回纯LaTeX代码，不要用markdown代码块包裹，不要加$符号，不要解释。",
    }
}

// ── Vision model detection ──

fn is_vision_model(id: &str) -> bool {
    let upper = id.to_uppercase();
    upper.contains("VL") || upper.contains("OCR") || upper.contains("PADDLEOCR")
        || upper.contains("OMNI") || upper.contains("CAPTIONER") || id.contains("vl2")
        || id.contains("Kimi-K2.5")
        || {
            // GLM-x.xV pattern
            let parts: Vec<&str> = id.split('/').collect();
            let last = parts.last().unwrap_or(&"");
            last.contains("GLM-") && last.ends_with('V')
        }
}

fn is_ocr_only_model(id: &str) -> bool {
    let upper = id.to_uppercase();
    upper.contains("PADDLEOCR") || upper.contains("DEEPSEEK-OCR") || upper.contains("CAPTIONER")
}

fn model_id_to_name(id: &str) -> String {
    let is_pro = id.starts_with("Pro/");
    let stripped = if is_pro { &id[4..] } else { id };
    let parts: Vec<&str> = stripped.split('/').collect();
    let name = parts.last().unwrap_or(&id)
        .trim_end_matches("-Instruct");
    if is_pro {
        format!("{} (Pro)", name)
    } else {
        name.to_string()
    }
}

// ── Store helpers ──

fn get_store_string(app: &AppHandle, key: &str) -> String {
    let store = app.store("config.json").unwrap();
    store.get(key)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default()
}

fn get_store_vec(app: &AppHandle, key: &str) -> Vec<String> {
    let store = app.store("config.json").unwrap();
    store.get(key)
        .and_then(|v| serde_json::from_value::<Vec<String>>(v.clone()).ok())
        .unwrap_or_default()
}

// ── Usage tracking ──

fn get_usage_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app.path().app_data_dir().unwrap();
    std::fs::create_dir_all(&dir).ok();
    dir.join("usage.json")
}

fn load_usage(app: &AppHandle) -> (String, HashMap<String, u32>) {
    let path = get_usage_path(app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
            let date = val["date"].as_str().unwrap_or("").to_string();
            let models: HashMap<String, u32> = val["models"].as_object()
                .map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_u64().unwrap_or(0) as u32)).collect())
                .unwrap_or_default();
            return (date, models);
        }
    }
    (String::new(), HashMap::new())
}

fn get_model_usage_today(app: &AppHandle, model_id: &str) -> u32 {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let (date, models) = load_usage(app);
    if date != today { return 0; }
    *models.get(model_id).unwrap_or(&0)
}

fn increment_model_usage(app: &AppHandle, model_id: &str) {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let (date, mut models) = load_usage(app);
    if date != today {
        models.clear();
    }
    let count = models.entry(model_id.to_string()).or_insert(0);
    *count += 1;
    let val = serde_json::json!({ "date": today, "models": models });
    let path = get_usage_path(app);
    std::fs::write(path, serde_json::to_string_pretty(&val).unwrap()).ok();
}

// ── API helpers ──

async fn fetch_sf_balance(api_key: &str) -> Option<(String, String)> {
    if api_key.is_empty() { return None; }
    let client = reqwest::Client::new();
    let res = client.get("https://api.siliconflow.cn/v1/user/info")
        .header("Authorization", format!("Bearer {}", api_key))
        .send().await.ok()?;
    if !res.status().is_success() { return None; }
    let data: serde_json::Value = res.json().await.ok()?;
    let charge = data["data"]["chargeBalance"].as_str().unwrap_or("0").to_string();
    let total = data["data"]["totalBalance"].as_str()
        .or_else(|| data["data"]["balance"].as_str())
        .unwrap_or("0").to_string();
    Some((charge, total))
}

async fn fetch_sf_vision_models(api_key: &str) -> Vec<SfModel> {
    if api_key.is_empty() { return vec![]; }
    let client = reqwest::Client::new();

    // Fetch models
    let models_res = client.get("https://api.siliconflow.cn/v1/models?sub_type=chat")
        .header("Authorization", format!("Bearer {}", api_key))
        .send().await;
    let all_models: Vec<String> = match models_res {
        Ok(r) if r.status().is_success() => {
            let data: serde_json::Value = r.json().await.unwrap_or_default();
            data["data"].as_array()
                .map(|arr| arr.iter().filter_map(|m| m["id"].as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default()
        }
        _ => return vec![],
    };

    // Fetch pricing
    let pricing_map = fetch_pricing_map().await;

    let mut result: Vec<SfModel> = all_models.iter()
        .filter(|id| is_vision_model(id))
        .map(|id| {
            let price = pricing_map.get(id.as_str());
            let input_price = price.map(|p| p.0).unwrap_or(-1.0);
            let output_price = price.map(|p| p.1).unwrap_or(-1.0);
            let is_free = input_price == 0.0 && output_price == 0.0;
            let is_ocr_only = is_ocr_only_model(id);
            let pricing = if input_price < 0.0 {
                "价格未知".to_string()
            } else if is_free {
                "免费".to_string()
            } else {
                format!("入¥{}/出¥{}", input_price, output_price)
            };
            SfModel {
                id: id.clone(),
                name: model_id_to_name(id),
                pricing,
                modes: if is_ocr_only { vec!["ocr".into()] } else { vec!["formula".into(), "ocr".into()] },
                input_price: input_price.max(0.0),
                output_price: output_price.max(0.0),
                free: is_free,
            }
        })
        .collect();

    result.sort_by(|a, b| {
        if a.free && !b.free { return std::cmp::Ordering::Less; }
        if !a.free && b.free { return std::cmp::Ordering::Greater; }
        a.input_price.partial_cmp(&b.input_price).unwrap_or(std::cmp::Ordering::Equal)
    });
    result
}

async fn fetch_pricing_map() -> HashMap<String, (f64, f64)> {
    let mut map = HashMap::new();
    let client = reqwest::Client::new();
    let res = match client.get("https://siliconflow.cn/pricing").send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return map,
    };
    let html = res.text().await.unwrap_or_default();
    let re = regex_lite::Regex::new(
        r#"href="[^"]*?target=([^"]+)"[^>]*>([^<]+)</a></div><div[^>]*>(免费|[\d.]+)</div><div[^>]*>(免费|[\d.]+)</div>"#
    );
    if let Ok(re) = re {
        for cap in re.captures_iter(&html) {
            let id = cap[2].trim().to_string();
            let inp = if &cap[3] == "免费" { 0.0 } else { cap[3].parse().unwrap_or(-1.0) };
            let out = if &cap[4] == "免费" { 0.0 } else { cap[4].parse().unwrap_or(-1.0) };
            if inp >= 0.0 && out >= 0.0 {
                map.insert(id, (inp, out));
            }
        }
    }
    map
}

async fn recognize_simpletex(token: &str, image_base64: &str, model_id: &str, rec_mode: Option<&str>) -> Result<(String, f64), String> {
    let base64_data = image_base64.split(",").last().unwrap_or(image_base64);
    let image_bytes = base64::engine::general_purpose::STANDARD.decode(base64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    let part = multipart::Part::bytes(image_bytes)
        .file_name("image.png")
        .mime_str("image/png").unwrap();
    let mut form = multipart::Form::new().part("file", part);
    if let Some(rm) = rec_mode {
        form = form.text("rec_mode", rm.to_string());
    }

    let client = reqwest::Client::new();
    let res = client.post(format!("https://server.simpletex.net/api/{}", model_id))
        .header("token", token)
        .multipart(form)
        .send().await
        .map_err(|e| format!("SimpleTex 请求失败: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("SimpleTex API 错误: {}", res.status()));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    if !data["status"].as_bool().unwrap_or(false) {
        let err_type = data["res"]["errType"].as_str()
            .or_else(|| data["err_info"]["err_type"].as_str())
            .or_else(|| data["errType"].as_str())
            .unwrap_or("unknown");
        if err_type == "req_unauthorized" {
            return Err("SimpleTex Token 无效或已过期".into());
        }
        if err_type == "resource_no_valid" {
            return Err("SimpleTex 额度已用完".into());
        }
        return Err(format!("SimpleTex 识别失败: {}", err_type));
    }

    let res_obj = &data["res"];
    let text = if let Some(s) = res_obj["info"].as_str() {
        s.to_string()
    } else if res_obj["info"].is_object() {
        res_obj["info"]["markdown"].as_str()
            .or_else(|| res_obj["info"]["text"].as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| res_obj["info"].to_string())
    } else {
        res_obj["markdown"].as_str()
            .or_else(|| res_obj["latex"].as_str())
            .unwrap_or("").to_string()
    };

    let conf = res_obj["conf"].as_f64().unwrap_or(0.0);
    Ok((text, conf))
}

// ══════════════════════════════════════════════════════════════
// Tauri command handlers
// ══════════════════════════════════════════════════════════════

#[tauri::command(rename_all = "snake_case")]
pub async fn get_settings(app: AppHandle) -> Result<SettingsResponse, String> {
    let st_token = get_store_string(&app, "simpletex_token");
    let sf_key = get_store_string(&app, "siliconflow_key");
    let simpletex_model = get_store_string(&app, "simpletex_model");
    let simpletex_model = if simpletex_model.is_empty() { "latex_ocr".to_string() } else { simpletex_model };
    let voucher_models = get_store_vec(&app, "voucher_models");

    let mut usage_by_model = HashMap::new();
    for &(id, _, _, _) in SIMPLETEX_MODELS {
        usage_by_model.insert(id.to_string(), get_model_usage_today(&app, id));
    }

    let (sf_balance, sf_charge_balance) = if !sf_key.is_empty() {
        match fetch_sf_balance(&sf_key).await {
            Some((charge, total)) => (Some(total), Some(charge)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    Ok(SettingsResponse {
        has_key: !sf_key.is_empty(),
        has_simpletex: !st_token.is_empty(),
        simpletex_model,
        simpletex_models: SIMPLETEX_MODELS.iter().map(|&(id, name, free, _)| SimpleTexModelInfo {
            id: id.to_string(),
            name: name.to_string(),
            free_per_day: free,
        }).collect(),
        simpletex_usage_by_model: usage_by_model,
        sf_balance,
        sf_charge_balance,
        voucher_models,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_settings(
    app: AppHandle,
    simpletex_token: Option<String>,
    siliconflow_key: Option<String>,
    simpletex_model: Option<String>,
    voucher_models_text: Option<String>,
) -> Result<serde_json::Value, String> {
    let store = app.store("config.json").map_err(|e| e.to_string())?;
    let mut errors: Vec<String> = Vec::new();

    // Validate & save SimpleTex token
    if let Some(ref token) = simpletex_token {
        if !token.is_empty() {
            if validate_simpletex_token(token).await {
                store.set("simpletex_token", serde_json::json!(token));
            } else {
                store.set("simpletex_token", serde_json::json!(""));
                errors.push("SimpleTex Token 无效，已清除".into());
            }
        }
    }
    // Validate & save SiliconFlow key
    if let Some(ref key) = siliconflow_key {
        if !key.is_empty() {
            if validate_siliconflow_key(key).await {
                store.set("siliconflow_key", serde_json::json!(key));
            } else {
                store.set("siliconflow_key", serde_json::json!(""));
                errors.push("硅基流动 API Key 无效，已清除".into());
            }
        }
    }
    if let Some(ref model) = simpletex_model {
        store.set("simpletex_model", serde_json::json!(model));
    }
    if let Some(ref text) = voucher_models_text {
        let ids: Vec<String> = text.lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && l.contains('/'))
            .collect();
        store.set("voucher_models", serde_json::json!(ids));
    }

    if errors.is_empty() {
        Ok(serde_json::json!({ "ok": true }))
    } else {
        Ok(serde_json::json!({ "ok": false, "errors": errors }))
    }
}

async fn validate_simpletex_token(token: &str) -> bool {
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAASklEQVR4nO3OsQ3AIBAAsd9/abIAzSkFCNkTeNaV5nRgT6vQKrQKrUKr0CqeaM0/WlpaWlpaWlpaWlpaR2gVWoVWoVVoFVrFpa0PK6QKSH2kFl4AAAAASUVORK5CYII=")
        .unwrap();
    let part = multipart::Part::bytes(png_bytes).file_name("test.png").mime_str("image/png").unwrap();
    let form = multipart::Form::new().part("file", part);
    let client = reqwest::Client::new();
    match client.post("https://server.simpletex.net/api/latex_ocr_turbo")
        .header("token", token)
        .multipart(form)
        .send().await {
        Ok(r) => {
            if r.status().as_u16() == 401 { return false; }
            let body = r.text().await.unwrap_or_default();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                let err_type = val["res"]["errType"].as_str()
                    .or_else(|| val["err_info"]["err_type"].as_str())
                    .unwrap_or("");
                if err_type == "req_unauthorized" { return false; }
            }
            true // 200 or server error (not auth error) = token valid
        }
        Err(_) => false,
    }
}

async fn validate_siliconflow_key(key: &str) -> bool {
    let client = reqwest::Client::new();
    match client.get("https://api.siliconflow.cn/v1/user/info")
        .header("Authorization", format!("Bearer {}", key))
        .send().await {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn test_simpletex(app: AppHandle, token: Option<String>) -> Result<TestResult, String> {
    let stored_token = get_store_string(&app, "simpletex_token");
    let use_token = token.as_deref().filter(|s| !s.is_empty()).unwrap_or(&stored_token);
    if use_token.is_empty() {
        return Ok(TestResult { ok: false, error: Some("未填写 Token".into()), balance: None });
    }

    // Send a 50x50 PNG (white bg, black square) to latex_ocr_turbo
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAASklEQVR4nO3OsQ3AIBAAsd9/abIAzSkFCNkTeNaV5nRgT6vQKrQKrUKr0CqeaM0/WlpaWlpaWlpaWlpaR2gVWoVWoVVoFVrFpa0PK6QKSH2kFl4AAAAASUVORK5CYII=")
        .unwrap();

    let part = multipart::Part::bytes(png_bytes).file_name("test.png").mime_str("image/png").unwrap();
    let form = multipart::Form::new().part("file", part);

    let client = reqwest::Client::new();
    let res = match client.post("https://server.simpletex.net/api/latex_ocr_turbo")
        .header("token", use_token)
        .multipart(form)
        .send().await {
        Ok(r) => r,
        Err(e) => return Ok(TestResult { ok: false, error: Some(format!("网络错误: {}", e)), balance: None }),
    };

    if res.status().as_u16() == 401 {
        return Ok(TestResult { ok: false, error: Some("Token 无效或已过期".into()), balance: None });
    }
    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        // Check for specific error types in both res.errType and err_info.err_type paths
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
            let err_type = val["res"]["errType"].as_str()
                .or_else(|| val["err_info"]["err_type"].as_str())
                .or_else(|| val["errType"].as_str())
                .unwrap_or("");
            if err_type == "req_unauthorized" {
                return Ok(TestResult { ok: false, error: Some("Token 无效或已过期".into()), balance: None });
            }
            if err_type == "resource_no_valid" {
                return Ok(TestResult { ok: false, error: Some("无可用资源（额度已用完）".into()), balance: None });
            }
        }
        return Ok(TestResult { ok: false, error: Some(format!("服务器错误 (HTTP {})", status)), balance: None });
    }

    let data: serde_json::Value = res.json().await.unwrap_or_default();
    if !data["status"].as_bool().unwrap_or(false) {
        // Check both res.errType and err_info.err_type paths
        let err_type = data["res"]["errType"].as_str()
            .or_else(|| data["err_info"]["err_type"].as_str())
            .or_else(|| data["errType"].as_str())
            .unwrap_or("未知错误");
        if err_type == "req_unauthorized" {
            return Ok(TestResult { ok: false, error: Some("Token 无效或已过期".into()), balance: None });
        }
        if err_type == "resource_no_valid" {
            return Ok(TestResult { ok: false, error: Some("无可用资源（额度已用完）".into()), balance: None });
        }
        return Ok(TestResult { ok: false, error: Some(err_type.to_string()), balance: None });
    }

    Ok(TestResult { ok: true, error: None, balance: None })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn test_siliconflow(app: AppHandle, api_key: Option<String>) -> Result<TestResult, String> {
    let stored_key = get_store_string(&app, "siliconflow_key");
    let use_key = api_key.as_deref().filter(|s| !s.is_empty()).unwrap_or(&stored_key);
    if use_key.is_empty() {
        return Ok(TestResult { ok: false, error: Some("未填写 API Key".into()), balance: None });
    }

    let client = reqwest::Client::new();
    let res = match client.get("https://api.siliconflow.cn/v1/user/info")
        .header("Authorization", format!("Bearer {}", use_key))
        .send().await {
        Ok(r) => r,
        Err(e) => return Ok(TestResult { ok: false, error: Some(format!("网络错误: {}", e)), balance: None }),
    };

    if res.status().as_u16() == 401 {
        return Ok(TestResult { ok: false, error: Some("API Key 无效".into()), balance: None });
    }
    if !res.status().is_success() {
        return Ok(TestResult { ok: false, error: Some(format!("HTTP {}", res.status())), balance: None });
    }

    let data: serde_json::Value = res.json().await.unwrap_or_default();
    let balance = data["data"]["totalBalance"].as_str()
        .or_else(|| data["data"]["balance"].as_str())
        .map(|s| s.to_string());

    Ok(TestResult { ok: true, error: None, balance })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_available_models(app: AppHandle) -> Result<AvailableModelsResponse, String> {
    let st_token = get_store_string(&app, "simpletex_token");
    let sf_key = get_store_string(&app, "siliconflow_key");
    let voucher_models = get_store_vec(&app, "voucher_models");
    let st_valid = !st_token.is_empty();
    let sf_valid = !sf_key.is_empty();

    let mut models: Vec<AvailableModel> = Vec::new();

    // SimpleTex models
    for &(id, name, free_per_day, st_mode) in SIMPLETEX_MODELS {
        let modes = if st_mode == "document" {
            vec!["formula".into(), "ocr".into(), "document".into()]
        } else {
            vec![st_mode.to_string()]
        };
        models.push(AvailableModel {
            id: format!("simpletex:{}", id),
            name: name.to_string(),
            provider: "SimpleTex".to_string(),
            modes,
            available: st_valid,
            free_per_day: Some(free_per_day),
            usage_today: Some(get_model_usage_today(&app, id)),
            pricing: Some(format!("每日免费 {} 次", free_per_day)),
            free: None,
            voucher: None,
            charge_balance: None,
            total_balance: None,
        });
    }

    // SiliconFlow vision models
    let sf_balance = if sf_valid { fetch_sf_balance(&sf_key).await } else { None };
    let sf_models = if sf_valid { fetch_sf_vision_models(&sf_key).await } else { vec![] };

    for m in &sf_models {
        let is_voucher = voucher_models.contains(&m.id);
        models.push(AvailableModel {
            id: format!("siliconflow:{}", m.id),
            name: m.name.clone(),
            provider: "硅基流动".to_string(),
            modes: m.modes.clone(),
            available: sf_valid,
            free_per_day: None,
            usage_today: None,
            pricing: Some(m.pricing.clone()),
            free: Some(m.free),
            voucher: Some(is_voucher),
            charge_balance: sf_balance.as_ref().map(|(c, _)| c.clone()),
            total_balance: sf_balance.as_ref().map(|(_, t)| t.clone()),
        });
    }

    let (sf_bal, sf_charge) = match &sf_balance {
        Some((c, t)) => (Some(t.clone()), Some(c.clone())),
        None => (None, None),
    };
    let voucher_balance = sf_balance.as_ref().map(|(c, t)| {
        let total: f64 = t.parse().unwrap_or(0.0);
        let charge: f64 = c.parse().unwrap_or(0.0);
        format!("{:.4}", total - charge)
    });

    Ok(AvailableModelsResponse {
        models,
        sf_balance: sf_bal,
        sf_charge_balance: sf_charge,
        voucher_balance,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_sf_balance(app: AppHandle) -> Result<BalanceResponse, String> {
    let sf_key = get_store_string(&app, "siliconflow_key");
    if sf_key.is_empty() {
        return Ok(BalanceResponse { charge_balance: None, total_balance: None, voucher_balance: None });
    }
    match fetch_sf_balance(&sf_key).await {
        Some((charge, total)) => {
            let vc = {
                let t: f64 = total.parse().unwrap_or(0.0);
                let c: f64 = charge.parse().unwrap_or(0.0);
                format!("{:.4}", t - c)
            };
            Ok(BalanceResponse {
                charge_balance: Some(charge),
                total_balance: Some(total),
                voucher_balance: Some(vc),
            })
        }
        None => Ok(BalanceResponse { charge_balance: None, total_balance: None, voucher_balance: None }),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("无法打开链接: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn recognize(
    app: AppHandle,
    image: String,
    mode: String,
    model_id: String,
) -> Result<RecognizeResponse, String> {
    let (provider, actual_model) = if model_id.contains(':') {
        let i = model_id.find(':').unwrap();
        (model_id[..i].to_string(), model_id[i+1..].to_string())
    } else {
        // Fallback
        let st_token = get_store_string(&app, "simpletex_token");
        if !st_token.is_empty() && mode == "formula" {
            ("simpletex".to_string(), "latex_ocr".to_string())
        } else {
            ("siliconflow".to_string(), String::new())
        }
    };

    if provider == "simpletex" {
        let token = get_store_string(&app, "simpletex_token");
        if token.is_empty() {
            return Err("SimpleTex Token 未配置".into());
        }

        let rec_mode = if actual_model == "simpletex_ocr" {
            Some(if mode == "formula" { "formula" } else { "document" })
        } else {
            None
        };

        let (text, _conf) = recognize_simpletex(&token, &image, &actual_model, rec_mode).await?;
        increment_model_usage(&app, &actual_model);

        let model_name = SIMPLETEX_MODELS.iter()
            .find(|&&(id, _, _, _)| id == actual_model)
            .map(|&(_, name, _, _)| name)
            .unwrap_or(&actual_model);

        return Ok(RecognizeResponse {
            text,
            model: format!("SimpleTex ({})", model_name),
            verified: None,
            corrected: None,
            original_text: None,
        });
    }

    // SiliconFlow path
    let sf_key = get_store_string(&app, "siliconflow_key");
    if sf_key.is_empty() {
        return Err("请先在设置中配置硅基流动 API Key".into());
    }

    let sf_model = if actual_model.is_empty() {
        // No model specified, this shouldn't happen normally
        return Err("未选择模型".into());
    } else {
        actual_model.clone()
    };

    let image_url = if image.starts_with("data:") {
        image.clone()
    } else {
        format!("data:image/png;base64,{}", image)
    };

    let prompt = get_prompt(&mode);

    let client = reqwest::Client::new();

    // Step 1: Recognize
    let body = serde_json::json!({
        "model": sf_model,
        "messages": [{
            "role": "user",
            "content": [
                { "type": "image_url", "image_url": { "url": image_url, "detail": "high" } },
                { "type": "text", "text": prompt }
            ]
        }],
        "max_tokens": 4096
    });

    let res = client.post(SILICONFLOW_API_URL)
        .header("Authorization", format!("Bearer {}", sf_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let err_text = res.text().await.unwrap_or_default();
        let mut user_msg = format!("API 调用失败: {}", status);
        if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&err_text) {
            let msg = err_json["message"].as_str()
                .or_else(|| err_json["error"]["message"].as_str())
                .unwrap_or("");
            if !msg.is_empty() {
                if msg.to_lowercase().contains("height") && msg.to_lowercase().contains("width") && msg.to_lowercase().contains("must be larger") {
                    user_msg = "图片尺寸太小，该模型要求最小 28×28 像素，请使用更大的图片".into();
                } else {
                    user_msg = msg.to_string();
                }
            }
        }
        return Err(user_msg);
    }

    let data1: serde_json::Value = res.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let text1 = data1["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();

    if text1.is_empty() {
        return Ok(RecognizeResponse {
            text: String::new(),
            model: sf_model,
            verified: Some(false),
            corrected: None,
            original_text: None,
        });
    }

    // Step 2: Verify — only for formula mode
    if mode == "formula" {
        let verify_prompt = format!(
            "请对照图片检查以下LaTeX公式是否正确。如果正确，原样返回该公式；如果有错误，返回修正后的公式。只返回最终的纯LaTeX代码，不要解释。\n\n识别结果：{}",
            text1
        );

        let verify_body = serde_json::json!({
            "model": sf_model,
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image_url", "image_url": { "url": image_url, "detail": "high" } },
                    { "type": "text", "text": verify_prompt }
                ]
            }],
            "max_tokens": 4096
        });

        let verify_res = client.post(SILICONFLOW_API_URL)
            .header("Authorization", format!("Bearer {}", sf_key))
            .header("Content-Type", "application/json")
            .json(&verify_body)
            .send().await;

        if let Ok(vr) = verify_res {
            if vr.status().is_success() {
                if let Ok(data2) = vr.json::<serde_json::Value>().await {
                    let text2 = data2["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();
                    if !text2.is_empty() {
                        let n1 = text1.split_whitespace().collect::<Vec<_>>().join(" ");
                        let n2 = text2.split_whitespace().collect::<Vec<_>>().join(" ");
                        let verified = n1 == n2;
                        let corrected = !verified;
                        let final_text = if corrected { text2.clone() } else { text1.clone() };
                        return Ok(RecognizeResponse {
                            text: final_text,
                            model: sf_model,
                            verified: Some(verified),
                            corrected: Some(corrected),
                            original_text: if corrected { Some(text1) } else { None },
                        });
                    }
                }
            }
        }
    }

    // Non-formula mode or verify failed — return first result
    Ok(RecognizeResponse {
        text: text1,
        model: sf_model,
        verified: if mode == "formula" { Some(false) } else { None },
        corrected: None,
        original_text: None,
    })
}
