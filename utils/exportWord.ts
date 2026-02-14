import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';

export async function exportToWord(content: string, mode: string): Promise<void> {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: mode === 'formula' ? '公式识别结果' : mode === 'document' ? '通用识别结果' : 'OCR识别结果',
          bold: true,
          size: 32,
          font: 'Microsoft YaHei',
        }),
      ],
    })
  );

  // Timestamp
  paragraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `识别时间: ${new Date().toLocaleString('zh-CN')}`,
          size: 18,
          color: '888888',
          font: 'Microsoft YaHei',
        }),
      ],
    })
  );

  // Separator
  paragraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // Content - split by lines and add each as a paragraph
  const lines = content.split('\n');
  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: line,
            size: 24,
            font: mode === 'formula' ? 'Cambria Math' : 'Microsoft YaHei',
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `识别结果_${Date.now()}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
