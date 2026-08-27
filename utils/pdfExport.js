import PDFDocument from 'pdfkit';

const BRAND = '#4f46e5';
const BRAND_LIGHT = '#eef2ff';
const MUTED = '#64748b';
const TEXT = '#0f172a';
const BODY = '#334155';
const BORDER = '#e2e8f0';
const DANGER = '#dc2626';
const DANGER_BG = '#fef2f2';
const DANGER_TEXT = '#991b1b';
const CARD_BG = '#f8fafc';
const FOOTER_BAND = 42;

const MARGINS = {
  top: 50,
  bottom: 64 + FOOTER_BAND,
  left: 50,
  right: 50,
};

const buildLayout = (doc) => {
  const { width, height, margins } = doc.page;
  const left = margins.left;
  const pageWidth = width - margins.left - margins.right;
  const contentBottom = height - margins.bottom;

  return {
    left,
    pageWidth,
    contentBottom,
    width,
    height,
    margins,
  };
};

/*
 * Draw watermark without changing the document's current cursor position.
 * This is important because PDFKit's text() can update doc.y even when
 * explicit x/y coordinates are supplied.
 */
const drawWatermark = (doc) => {
  const { width, height } = buildLayout(doc);
  const cx = width / 2;
  const cy = height / 2;

  const previousX = doc.x;
  const previousY = doc.y;

  doc.save();
  doc.fillOpacity(0.045);
  doc.rotate(-34, { origin: [cx, cy] });

  doc.font('Helvetica-Bold')
    .fontSize(34)
    .fillColor(BRAND)
    .text('LOCKFORGE', cx - 130, cy - 28, {
      width: 260,
      align: 'center',
      lineBreak: false,
    });

  doc.font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('CONFIDENTIAL', cx - 130, cy + 10, {
      width: 260,
      align: 'center',
      lineBreak: false,
    });

  doc.restore();
  doc.fillOpacity(1);

  // Restore the content cursor.
  doc.x = previousX;
  doc.y = previousY;
};

const ensureSpace = (doc, height) => {
  const { contentBottom } = buildLayout(doc);

  if (doc.y + height > contentBottom) {
    doc.addPage();
  }
};

const measureText = (
  doc,
  text,
  width,
  size = 9,
  bold = false,
  lineGap = 2
) => {
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size);

  return doc.heightOfString(String(text), {
    width,
    lineGap,
  });
};

const writeAt = (doc, text, x, y, options = {}) => {
  const {
    width,
    size = 9,
    bold = false,
    color = BODY,
    lineGap = 2,
  } = options;

  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(color)
    .text(String(text), x, y, {
      width,
      lineGap,
    });
};

const writeFlow = (doc, text, options = {}) => {
  const layout = buildLayout(doc);

  const {
    x = layout.left,
    width = layout.pageWidth,
    size = 10,
    bold = false,
    color = TEXT,
    lineGap = 2,
    afterGap = 5,
  } = options;

  const textHeight = measureText(
    doc,
    text,
    width,
    size,
    bold,
    lineGap
  );

  ensureSpace(doc, textHeight + afterGap);

  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(color)
    .text(String(text), x, doc.y, {
      width,
      lineGap,
    });

  doc.y += afterGap;
};

const drawRule = (doc, gap = 10) => {
  const { left, pageWidth } = buildLayout(doc);

  ensureSpace(doc, gap + 2);

  const y = doc.y;

  doc
    .moveTo(left, y)
    .lineTo(left + pageWidth, y)
    .strokeColor(BORDER)
    .lineWidth(0.75)
    .stroke();

  doc.y = y + gap;
};

const collectCredentialFields = (cred) => {
  const fields = [
    ['Username', cred.username],
    ['Email', cred.email],
    ['Password', cred.password],
    ['URL', cred.url],
    ['Notes', cred.notes],
  ].filter(([, value]) => value);

  (cred.customFields || []).forEach((cf) => {
    if (cf.label && cf.value) {
      fields.push([cf.label, cf.value]);
    }
  });

  return fields;
};

const getFieldRowHeight = (doc, label, value) => {
  const layout = buildLayout(doc);
  const labelCol = 92;
  const valueX = layout.left + labelCol;
  const valueWidth = layout.pageWidth - labelCol - 8;

  const labelH = measureText(
    doc,
    label,
    labelCol - 10,
    8,
    true,
    1
  );

  const valueH = measureText(
    doc,
    value,
    valueWidth,
    9,
    false,
    2
  );

  return {
    valueX,
    valueWidth,
    height: Math.max(labelH, valueH) + 9,
  };
};

const drawFieldRow = (doc, label, value) => {
  const layout = buildLayout(doc);
  const labelCol = 92;

  const {
    valueX,
    valueWidth,
    height: rowH,
  } = getFieldRowHeight(doc, label, value);

  ensureSpace(doc, rowH);

  const y = doc.y;

  writeAt(doc, label, layout.left + 8, y + 1, {
    width: labelCol - 10,
    size: 8,
    bold: true,
    color: MUTED,
    lineGap: 1,
  });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(BODY)
    .text(String(value), valueX, y, {
      width: valueWidth,
      lineGap: 2,
    });

  doc.y = y + rowH;
};

const getCredentialHeight = (doc, cred) => {
  const layout = buildLayout(doc);
  const fields = collectCredentialFields(cred);

  const titleHeight = measureText(
    doc,
    `1. ${cred.serviceName}`,
    layout.pageWidth - 24,
    11,
    true,
    2
  );

  const fieldsHeight = fields.reduce(
    (total, [label, value]) =>
      total + getFieldRowHeight(doc, label, value).height,
    0
  );

  const updatedHeight = measureText(
    doc,
    `Updated ${new Date(cred.updatedAt).toLocaleString()}`,
    layout.pageWidth - 24,
    8,
    false,
    2
  );

  return (
    12 +
    titleHeight +
    5 +
    fieldsHeight +
    5 +
    updatedHeight +
    14
  );
};

const drawCredentialCard = (doc, cred, index) => {
  const layout = buildLayout(doc);
  const fields = collectCredentialFields(cred);

  const cardHeight = getCredentialHeight(doc, cred);

  ensureSpace(doc, cardHeight);

  const cardY = doc.y;

  // Card background.
  doc.save();

  doc
    .roundedRect(
      layout.left,
      cardY,
      layout.pageWidth,
      cardHeight,
      6
    )
    .fill(CARD_BG);

  doc.restore();

  // Brand accent.
  doc.save();

  doc
    .moveTo(layout.left, cardY + 8)
    .lineTo(layout.left, cardY + 28)
    .strokeColor(BRAND)
    .lineWidth(3)
    .stroke();

  doc.restore();

  doc.y = cardY + 10;

  writeFlow(doc, `${index + 1}. ${cred.serviceName}`, {
    x: layout.left + 12,
    width: layout.pageWidth - 24,
    size: 11,
    bold: true,
    color: TEXT,
    afterGap: 5,
  });

  fields.forEach(([label, value]) => {
    drawFieldRow(doc, label, value);
  });

  writeFlow(
    doc,
    `Updated ${new Date(cred.updatedAt).toLocaleString()}`,
    {
      x: layout.left + 12,
      width: layout.pageWidth - 24,
      size: 8,
      color: MUTED,
      afterGap: 0,
    }
  );

  doc.y = cardY + cardHeight + 10;
};

const getNoteHeight = (doc, note) => {
  const layout = buildLayout(doc);

  const titleHeight = measureText(
    doc,
    `1. ${note.title}`,
    layout.pageWidth - 24,
    11,
    true,
    2
  );

  const contentHeight = measureText(
    doc,
    note.content || '(Empty note)',
    layout.pageWidth - 28,
    9,
    false,
    2
  );

  const updatedHeight = measureText(
    doc,
    `Updated ${new Date(note.updatedAt).toLocaleString()}`,
    layout.pageWidth - 24,
    8,
    false,
    2
  );

  return (
    12 +
    titleHeight +
    6 +
    contentHeight +
    6 +
    updatedHeight +
    14
  );
};

const drawNoteCard = (doc, note, index) => {
  const layout = buildLayout(doc);
  const cardHeight = getNoteHeight(doc, note);

  ensureSpace(doc, cardHeight);

  const cardY = doc.y;

  doc.save();

  doc
    .roundedRect(
      layout.left,
      cardY,
      layout.pageWidth,
      cardHeight,
      6
    )
    .fill(CARD_BG);

  doc.restore();

  doc.save();

  doc
    .moveTo(layout.left, cardY + 8)
    .lineTo(layout.left, cardY + 28)
    .strokeColor(BRAND)
    .lineWidth(3)
    .stroke();

  doc.restore();

  doc.y = cardY + 10;

  writeFlow(doc, `${index + 1}. ${note.title}`, {
    x: layout.left + 12,
    width: layout.pageWidth - 24,
    size: 11,
    bold: true,
    color: TEXT,
    afterGap: 5,
  });

  writeFlow(doc, note.content || '(Empty note)', {
    x: layout.left + 14,
    width: layout.pageWidth - 28,
    size: 9,
    color: BODY,
    afterGap: 5,
  });

  writeFlow(
    doc,
    `Updated ${new Date(note.updatedAt).toLocaleString()}`,
    {
      x: layout.left + 12,
      width: layout.pageWidth - 24,
      size: 8,
      color: MUTED,
      afterGap: 0,
    }
  );

  doc.y = cardY + cardHeight + 10;
};

const drawFolderBanner = (
  doc,
  title,
  credCount,
  noteCount
) => {
  const layout = buildLayout(doc);
  const bannerHeight = 34;

  ensureSpace(doc, bannerHeight + 14);

  const y = doc.y;

  doc.save();

  doc
    .roundedRect(
      layout.left,
      y,
      layout.pageWidth,
      bannerHeight,
      6
    )
    .fill(BRAND);

  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(title, layout.left + 12, y + 9, {
      width: layout.pageWidth - 150,
      lineBreak: false,
    });

  doc
    .font('Helvetica')
    .fontSize(8)
    .text(
      `${credCount} creds · ${noteCount} notes`,
      layout.left + layout.pageWidth - 128,
      y + 11,
      {
        width: 116,
        align: 'right',
        lineBreak: false,
      }
    );

  doc.restore();

  doc.y = y + bannerHeight + 12;
};

const drawSectionTitle = (doc, title) => {
  ensureSpace(doc, 28);

  writeFlow(doc, title, {
    size: 10,
    bold: true,
    color: BRAND,
    afterGap: 7,
  });
};

const drawStatBox = (
  doc,
  x,
  y,
  w,
  h,
  label,
  value
) => {
  doc.save();

  doc
    .roundedRect(x, y, w, h, 6)
    .fill(BRAND_LIGHT);

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(label, x + 10, y + 8, {
      width: w - 20,
      lineBreak: false,
    });

  doc
    .fillColor(TEXT)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(String(value), x + 10, y + 22, {
      width: w - 20,
      lineBreak: false,
    });

  doc.restore();
};

const drawCoverPage = (
  doc,
  {
    user,
    folders,
    credentials,
    notes,
    populatedSections,
  }
) => {
  const layout = buildLayout(doc);

  const headerY = doc.y;

  // Header.
  doc.save();

  doc
    .roundedRect(
      layout.left,
      headerY,
      layout.pageWidth,
      78,
      8
    )
    .fill(BRAND_LIGHT);

  doc
    .fillColor(BRAND)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(
      'LockForge Vault Export',
      layout.left + 16,
      headerY + 16,
      {
        width: layout.pageWidth - 32,
        lineBreak: false,
      }
    );

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      'Confidential — handle and destroy securely after use',
      layout.left + 16,
      headerY + 48,
      {
        width: layout.pageWidth - 32,
        lineBreak: false,
      }
    );

  doc.restore();

  doc.y = headerY + 92;

  writeFlow(
    doc,
    `Exported: ${new Date().toLocaleString()}`,
    {
      size: 9,
      color: MUTED,
      afterGap: 3,
    }
  );

  writeFlow(doc, `Account: ${user.email}`, {
    size: 10,
    bold: true,
    color: TEXT,
    afterGap: 14,
  });

  // Statistics.
  const boxGap = 8;
  const boxW =
    (layout.pageWidth - boxGap * 2) / 3;
  const boxH = 50;

  ensureSpace(doc, boxH + 16);

  const statsY = doc.y;

  drawStatBox(
    doc,
    layout.left,
    statsY,
    boxW,
    boxH,
    'Folders',
    folders.length
  );

  drawStatBox(
    doc,
    layout.left + boxW + boxGap,
    statsY,
    boxW,
    boxH,
    'Credentials',
    credentials.length
  );

  drawStatBox(
    doc,
    layout.left + (boxW + boxGap) * 2,
    statsY,
    boxW,
    boxH,
    'Notes',
    notes.length
  );

  doc.y = statsY + boxH + 16;

  // Security warning.
  ensureSpace(doc, 52);

  const warningY = doc.y;

  doc.save();

  doc
    .roundedRect(
      layout.left,
      warningY,
      layout.pageWidth,
      44,
      6
    )
    .fill(DANGER_BG);

  doc
    .fillColor(DANGER)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(
      'SECURITY WARNING',
      layout.left + 12,
      warningY + 9,
      {
        lineBreak: false,
      }
    );

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(DANGER_TEXT)
    .text(
      'This PDF contains decrypted passwords and notes. Store securely and delete when no longer needed.',
      layout.left + 12,
      warningY + 23,
      {
        width: layout.pageWidth - 24,
        lineGap: 1,
      }
    );

  doc.restore();

  doc.y = warningY + 54;

  if (!populatedSections.length) {
    return;
  }

  // Contents.
  ensureSpace(doc, 32);

  writeFlow(doc, 'Contents', {
    size: 12,
    bold: true,
    color: TEXT,
    afterGap: 9,
  });

  populatedSections.forEach((section, i) => {
    writeFlow(
      doc,
      `${i + 1}. ${section.name} — ${section.credentials.length} credentials, ${section.notes.length} notes`,
      {
        size: 9,
        color: MUTED,
        afterGap: 5,
      }
    );
  });
};

const drawFooters = (doc) => {
  const range = doc.bufferedPageRange();
  const total = range.count;

  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);

    const layout = buildLayout(doc);

    const footerLineY = layout.height - 48;
    const footerTextY = footerLineY + 6;
    const pageTextY = footerLineY + 18;

    const previousX = doc.x;
    const previousY = doc.y;

    /*
     * PDFKit normally prevents text from being drawn below
     * the page's bottom margin. Temporarily remove that
     * restriction because the footer intentionally lives
     * inside the reserved bottom area.
     */
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.save();

    doc
      .moveTo(layout.left, footerLineY)
      .lineTo(
        layout.left + layout.pageWidth,
        footerLineY
      )
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        '© LockForge Password Manager · Confidential · Authorized use only',
        layout.left,
        footerTextY,
        {
          width: layout.pageWidth,
          align: 'center',
          lineBreak: false,
        }
      );

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(BODY)
      .text(
        `Page ${i + 1} of ${total}`,
        layout.left,
        pageTextY,
        {
          width: layout.pageWidth,
          align: 'center',
          lineBreak: false,
        }
      );

    doc.restore();

    // Restore PDFKit's original bottom margin.
    doc.page.margins.bottom = previousBottomMargin;

    // Restore cursor position.
    doc.x = previousX;
    doc.y = previousY;
  }
};

const drawVaultSections = (
  doc,
  populatedSections
) => {
  if (!populatedSections.length) {
    return;
  }

  // Keep vault data separate from the cover page.
  doc.addPage();

  populatedSections.forEach(
    (section, sectionIndex) => {
      if (sectionIndex > 0) {
        ensureSpace(doc, 90);
      }

      drawFolderBanner(
        doc,
        section.name,
        section.credentials.length,
        section.notes.length
      );

      if (section.credentials.length) {
        drawSectionTitle(doc, 'Credentials');

        section.credentials.forEach(
          (cred, i) => {
            drawCredentialCard(doc, cred, i);
          }
        );
      }

      if (section.notes.length) {
        drawSectionTitle(doc, 'Secure Notes');

        section.notes.forEach(
          (note, i) => {
            drawNoteCard(doc, note, i);
          }
        );
      }

      // Small separation before the next folder.
      doc.y += 2;
    }
  );
};

export const buildVaultPdf = ({
  user,
  folders,
  credentials,
  notes,
  populatedSections,
}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: MARGINS,
    });

    const chunks = [];

    doc.on('data', (chunk) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', reject);

    try {
      // Add watermark to every newly created page.
      doc.on('pageAdded', () => {
        drawWatermark(doc);
      });

      // First page already exists, so draw manually.
      drawWatermark(doc);

      drawCoverPage(doc, {
        user,
        folders,
        credentials,
        notes,
        populatedSections,
      });

      drawVaultSections(doc, populatedSections);

      /*
       * Stop automatic watermark handling before switching
       * through buffered pages for footer rendering.
       */
      doc.removeAllListeners('pageAdded');

      drawFooters(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });


// import PDFDocument from 'pdfkit';

// const BRAND = '#4f46e5';
// const BRAND_LIGHT = '#eef2ff';
// const MUTED = '#64748b';
// const TEXT = '#0f172a';
// const BODY = '#334155';
// const BORDER = '#e2e8f0';
// const DANGER = '#dc2626';
// const FOOTER_BAND = 36;

// const MARGINS = { top: 52, bottom: 64 + FOOTER_BAND, left: 50, right: 50 };

// const buildLayout = (doc) => {
//   const { width, height, margins } = doc.page;
//   const left = margins.left;
//   const pageWidth = width - margins.left - margins.right;
//   const contentBottom = height - margins.bottom;
//   return { left, pageWidth, contentBottom, width, height, margins };
// };

// const drawWatermark = (doc) => {
//   const { width, height } = buildLayout(doc);
//   const cx = width / 2;
//   const cy = height / 2;

//   doc.save();
//   doc.fillOpacity(0.05);
//   doc.rotate(-34, { origin: [cx, cy] });
//   doc.font('Helvetica-Bold').fontSize(34).fillColor(BRAND)
//     .text('LOCKFORGE', cx - 130, cy - 28, { width: 260, align: 'center', lineBreak: false });
//   doc.font('Helvetica').fontSize(9).fillColor(MUTED)
//     .text('CONFIDENTIAL', cx - 130, cy + 10, { width: 260, align: 'center', lineBreak: false });
//   doc.restore();
//   doc.fillOpacity(1);
// };

// const ensureSpace = (doc, height) => {
//   const { contentBottom } = buildLayout(doc);
//   if (doc.y + height > contentBottom) doc.addPage();
// };

// const measureText = (doc, text, width, size = 9, bold = false, lineGap = 2) => {
//   doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
//   return doc.heightOfString(String(text), { width, lineGap });
// };

// const writeAt = (doc, text, x, y, options = {}) => {
//   const { width, size = 9, bold = false, color = BODY, lineGap = 2 } = options;
//   doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
//     .fontSize(size)
//     .fillColor(color)
//     .text(String(text), x, y, { width, lineGap });
// };

// const writeFlow = (doc, text, options = {}) => {
//   const layout = buildLayout(doc);
//   const {
//     x = layout.left,
//     width = layout.pageWidth,
//     size = 10,
//     bold = false,
//     color = TEXT,
//     lineGap = 2,
//     afterGap = 5,
//   } = options;

//   const minLine = measureText(doc, 'Ag', width, size, bold, lineGap);
//   ensureSpace(doc, minLine + afterGap);

//   doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
//     .fontSize(size)
//     .fillColor(color)
//     .text(String(text), x, doc.y, { width, lineGap });

//   doc.y += afterGap;
// };

// const drawRule = (doc, gap = 10) => {
//   const { left, pageWidth } = buildLayout(doc);
//   ensureSpace(doc, gap + 2);
//   const y = doc.y;
//   doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor(BORDER).lineWidth(0.75).stroke();
//   doc.y = y + gap;
// };

// const collectCredentialFields = (cred) => {
//   const fields = [
//     ['Username', cred.username],
//     ['Email', cred.email],
//     ['Password', cred.password],
//     ['URL', cred.url],
//     ['Notes', cred.notes],
//   ].filter(([, value]) => value);

//   (cred.customFields || []).forEach((cf) => {
//     if (cf.label && cf.value) fields.push([cf.label, cf.value]);
//   });

//   return fields;
// };

// const drawFieldRow = (doc, label, value) => {
//   const layout = buildLayout(doc);
//   const labelCol = 88;
//   const valueX = layout.left + labelCol;
//   const valueWidth = layout.pageWidth - labelCol - 4;
//   const labelH = measureText(doc, label, labelCol - 4, 8, true, 1);
//   const valueH = measureText(doc, value, valueWidth, 9, false, 2);
//   const rowH = Math.max(labelH, valueH) + 7;

//   ensureSpace(doc, rowH);
//   const y = doc.y;
//   writeAt(doc, label, layout.left + 8, y, { width: labelCol - 8, size: 8, bold: true, color: MUTED, lineGap: 1 });

//   doc.font('Helvetica').fontSize(9).fillColor(BODY)
//     .text(String(value), valueX, y, { width: valueWidth, lineGap: 2 });

//   doc.y = Math.max(y + rowH, doc.y) + 2;
// };

// const drawCredentialCard = (doc, cred, index) => {
//   const layout = buildLayout(doc);
//   const fields = collectCredentialFields(cred);

//   ensureSpace(doc, 36);
//   const cardY = doc.y;

//   doc.save();
//   doc.moveTo(layout.left, cardY).lineTo(layout.left, cardY + 14).strokeColor(BRAND).lineWidth(3).stroke();
//   doc.restore();

//   writeFlow(doc, `${index + 1}. ${cred.serviceName}`, {
//     x: layout.left + 10,
//     width: layout.pageWidth - 14,
//     size: 11,
//     bold: true,
//     color: TEXT,
//     afterGap: 8,
//   });

//   fields.forEach(([label, value]) => drawFieldRow(doc, label, value));

//   writeFlow(doc, `Updated ${new Date(cred.updatedAt).toLocaleString()}`, {
//     x: layout.left + 10,
//     width: layout.pageWidth - 14,
//     size: 8,
//     color: MUTED,
//     afterGap: 4,
//   });

//   drawRule(doc, 12);
// };

// const drawNoteCard = (doc, note, index) => {
//   const layout = buildLayout(doc);

//   ensureSpace(doc, 36);
//   const cardY = doc.y;

//   doc.save();
//   doc.moveTo(layout.left, cardY).lineTo(layout.left, cardY + 14).strokeColor(BRAND).lineWidth(3).stroke();
//   doc.restore();

//   writeFlow(doc, `${index + 1}. ${note.title}`, {
//     x: layout.left + 10,
//     width: layout.pageWidth - 14,
//     size: 11,
//     bold: true,
//     color: TEXT,
//     afterGap: 6,
//   });
//   writeFlow(doc, note.content || '(Empty note)', {
//     x: layout.left + 14,
//     width: layout.pageWidth - 20,
//     size: 9,
//     color: BODY,
//     afterGap: 4,
//   });
//   writeFlow(doc, `Updated ${new Date(note.updatedAt).toLocaleString()}`, {
//     x: layout.left + 10,
//     width: layout.pageWidth - 14,
//     size: 8,
//     color: MUTED,
//     afterGap: 4,
//   });

//   drawRule(doc, 12);
// };

// const drawFolderBanner = (doc, title, credCount, noteCount) => {
//   const layout = buildLayout(doc);
//   ensureSpace(doc, 44);
//   const y = doc.y;

//   doc.save();
//   doc.roundedRect(layout.left, y, layout.pageWidth, 30, 5).fill(BRAND);
//   doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
//     .text(title, layout.left + 12, y + 8, { width: layout.pageWidth - 120, lineBreak: false });
//   doc.font('Helvetica').fontSize(8)
//     .text(`${credCount} creds · ${noteCount} notes`, layout.left + layout.pageWidth - 108, y + 11, {
//       width: 96,
//       align: 'right',
//       lineBreak: false,
//     });
//   doc.restore();

//   doc.fillColor(TEXT);
//   doc.y = y + 38;
// };

// const drawSectionTitle = (doc, title) => {
//   writeFlow(doc, title, { size: 10, bold: true, color: BRAND, afterGap: 8 });
// };

// const drawStatBox = (doc, x, y, w, h, label, value) => {
//   doc.save();
//   doc.roundedRect(x, y, w, h, 5).fill(BRAND_LIGHT);
//   doc.fillColor(MUTED).font('Helvetica').fontSize(8)
//     .text(label, x + 10, y + 8, { width: w - 20, lineBreak: false });
//   doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(16)
//     .text(String(value), x + 10, y + 22, { width: w - 20, lineBreak: false });
//   doc.restore();
// };

// const drawCoverPage = (doc, { user, folders, credentials, notes, populatedSections }) => {
//   const layout = buildLayout(doc);
//   const headerY = doc.y;

//   doc.save();
//   doc.roundedRect(layout.left, headerY, layout.pageWidth, 76, 8).fill(BRAND_LIGHT);
//   doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(22)
//     .text('LockForge Vault Export', layout.left + 16, headerY + 16, { width: layout.pageWidth - 32, lineBreak: false });
//   doc.font('Helvetica').fontSize(10).fillColor(MUTED)
//     .text('Confidential — handle and destroy securely after use', layout.left + 16, headerY + 46, {
//       width: layout.pageWidth - 32,
//       lineBreak: false,
//     });
//   doc.restore();
//   doc.y = headerY + 88;

//   writeFlow(doc, `Exported: ${new Date().toLocaleString()}`, { size: 10, afterGap: 3 });
//   writeFlow(doc, `Account: ${user.email}`, { size: 10, afterGap: 12 });

//   const boxW = (layout.pageWidth - 12) / 3;
//   const boxH = 44;
//   ensureSpace(doc, boxH + 14);
//   const statsY = doc.y;
//   drawStatBox(doc, layout.left, statsY, boxW, boxH, 'Folders', folders.length);
//   drawStatBox(doc, layout.left + boxW + 6, statsY, boxW, boxH, 'Credentials', credentials.length);
//   drawStatBox(doc, layout.left + (boxW + 6) * 2, statsY, boxW, boxH, 'Notes', notes.length);
//   doc.y = statsY + boxH + 14;

//   ensureSpace(doc, 46);
//   const warningY = doc.y;
//   doc.save();
//   doc.roundedRect(layout.left, warningY, layout.pageWidth, 38, 6).fill('#fef2f2');
//   doc.fillColor(DANGER).font('Helvetica-Bold').fontSize(9)
//     .text('SECURITY WARNING', layout.left + 12, warningY + 8, { lineBreak: false });
//   doc.font('Helvetica').fontSize(8).fillColor('#991b1b')
//     .text(
//       'This PDF contains decrypted passwords and notes. Store securely and delete when no longer needed.',
//       layout.left + 12,
//       warningY + 21,
//       { width: layout.pageWidth - 24 },
//     );
//   doc.restore();
//   doc.y = warningY + 46;

//   if (!populatedSections.length) return;

//   writeFlow(doc, 'Contents', { size: 12, bold: true, afterGap: 8 });
//   populatedSections.forEach((section, i) => {
//     writeFlow(
//       doc,
//       `${i + 1}. ${section.name} — ${section.credentials.length} credentials, ${section.notes.length} notes`,
//       { size: 9, color: MUTED, afterGap: 4 },
//     );
//   });
// };

// const drawFooters = (doc) => {
//   const range = doc.bufferedPageRange();
//   const total = range.count;

//   for (let i = 0; i < total; i += 1) {
//     doc.switchToPage(range.start + i);
//     const layout = buildLayout(doc);
//     const footerTop = layout.height - FOOTER_BAND + 8;

//     doc.save();
//     doc.x = layout.left;
//     doc.y = layout.margins.top;

//     doc.moveTo(layout.left, footerTop)
//       .lineTo(layout.left + layout.pageWidth, footerTop)
//       .strokeColor(BORDER)
//       .lineWidth(0.5)
//       .stroke();

//     doc.font('Helvetica').fontSize(7).fillColor(MUTED)
//       .text('© LockForge Password Manager · Confidential · Authorized use only', layout.left, footerTop + 6, {
//         width: layout.pageWidth,
//         align: 'center',
//         lineBreak: false,
//       });

//     doc.fontSize(8).fillColor(BODY)
//       .text(`Page ${i + 1} of ${total}`, layout.left, footerTop + 18, {
//         width: layout.pageWidth,
//         align: 'center',
//         lineBreak: false,
//       });

//     doc.restore();
//   }
// };

// const drawVaultSections = (doc, populatedSections) => {
//   if (!populatedSections.length) return;

//   doc.addPage();

//   populatedSections.forEach((section, sectionIndex) => {
//     if (sectionIndex > 0) ensureSpace(doc, 80);

//     drawFolderBanner(doc, section.name, section.credentials.length, section.notes.length);

//     if (section.credentials.length) {
//       drawSectionTitle(doc, 'Credentials');
//       section.credentials.forEach((cred, i) => drawCredentialCard(doc, cred, i));
//     }

//     if (section.notes.length) {
//       drawSectionTitle(doc, 'Secure Notes');
//       section.notes.forEach((note, i) => drawNoteCard(doc, note, i));
//     }
//   });
// };

// export const buildVaultPdf = ({
//   user,
//   folders,
//   credentials,
//   notes,
//   populatedSections,
// }) => new Promise((resolve, reject) => {
//   const doc = new PDFDocument({
//     size: 'A4',
//     bufferPages: true,
//     margins: MARGINS,
//   });

//   const chunks = [];
//   doc.on('data', (chunk) => chunks.push(chunk));
//   doc.on('end', () => resolve(Buffer.concat(chunks)));
//   doc.on('error', reject);

//   try {
//     doc.on('pageAdded', () => drawWatermark(doc));
//     drawWatermark(doc);

//     drawCoverPage(doc, { user, folders, credentials, notes, populatedSections });
//     drawVaultSections(doc, populatedSections);

//     doc.removeAllListeners('pageAdded');
//     drawFooters(doc);
//     doc.end();
//   } catch (err) {
//     reject(err);
//   }
// });
