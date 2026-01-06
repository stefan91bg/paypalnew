import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { verifyToken } from '../../lib/auth';
import { supabase } from '../../lib/supabaseClient'; 
import fs from 'fs';
import path from 'path';

function addLinkAnnotation(page, x, y, width, height, url) { const ctx = page.node?.context || page.doc.context; const annotation = ctx.obj({ Type: PDFName.of("Annot"), Subtype: PDFName.of("Link"), Rect: ctx.obj([x, y, x + width, y + height]), Border: ctx.obj([0, 0, 0]), A: ctx.obj({ Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: PDFString.of(url) }) }); let annots = page.node.lookup(PDFName.of("Annots")); if (!annots) { annots = ctx.obj([]); page.node.set(PDFName.of("Annots"), annots); } annots.push(annotation); }
function sanitizePaypalLink(link) { if (!link || typeof link !== "string") throw new Error("Invalid PayPal link"); let l = link.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, ""); const regex = /^paypal\.me\/[A-Za-z0-9._-]+(\/?[0-9.,]*)?$/; if (!regex.test(l) || /[<>{}()]/.test(l)) throw new Error("Invalid PayPal link format"); return "https://" + l.replace(/^\/+/, ""); }
function collectEntries(node, acc = []) { if (!node || typeof node !== "object") return acc; if (Array.isArray(node.entries)) acc.push(...node.entries); if (Array.isArray(node.timeentries)) acc.push(...node.timeentries); for (const v of Object.values(node)) { if (Array.isArray(v)) v.forEach((child) => collectEntries(child, acc)); else if (typeof v === "object") collectEntries(v, acc); } return acc; }
function parseISODurationToSeconds(iso) { if (!iso) return 0; if (typeof iso === "number") return iso; const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return 0; const [, h, mm, s] = m; return (parseInt(h || 0) * 3600) + (parseInt(mm || 0) * 60) + (parseInt(s || 0)); }
function formatDuration(seconds, format = 'FULL') { seconds = Math.floor(seconds || 0); if (format === 'DECIMAL') { return (seconds / 3600).toFixed(2); } const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; const pad = (n) => String(n).padStart(2, "0"); if (format === 'COMPACT') { return `${h}:${pad(m)}`; } return `${pad(h)}:${pad(m)}:${pad(s)}`; }
function formatDateDDMMYYYY(iso) { if (!iso) return "—"; const d = new Date(iso); if (isNaN(d)) return "—"; return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function getAmountsMapFromEntry(e) { const map = {}; function add(currency, raw) { if (raw == null) return; const cur = (currency || "USD").toUpperCase(); const num = Number(raw) || 0; map[cur] = (map[cur] || 0) + num / 100; } if (Array.isArray(e.amounts)) { for (const it of e.amounts) { if (!it) continue; add(it.currency || e.currency, it.amount ?? it.value); } return map; } if (Array.isArray(e.amountByCurrency)) { for (const it of e.amountByCurrency) { if (!it) continue; add(it.currency || it.code, it.amount != null ? it.amount : it.value); } return map; } if (e.amount != null) add(e.currency || "USD", e.amount); if (e.totalAmount != null) add(e.currency || "USD", e.totalAmount); return map; }
function formatAmountsMap(map) { const parts = Object.keys(map).map(cur => `${map[cur].toFixed(2)} ${cur}`); return parts.join(", ") || ""; }
function drawText(page, text, x, y, options = {}) { page.drawText(String(text), { x, y, size: options.size ?? 10, font: options.font, color: options.color, maxWidth: options.maxWidth }); }

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header missing or malformed' });
        }
        const token = authHeader.split(' ')[1];
        const decodedToken = await verifyToken(token);
        const { workspaceId, reportsUrl, backendUrl } = decodedToken;
        
        const { start, end, USER_PAYPAL_LINK, billableFilter, projectFilter, clientFilter, clientName, clientAddress, taskFilter, descriptionFilter, withoutTask, withoutDescription, issueDate, dueDate, preview, columns: visibleColumns = { date: true, description: true, project: true, task: true } } = req.body;

        if (!preview) {
            const DOWNLOAD_LIMIT = 3; 
            const { data: installation, error: fetchError } = await supabase
                .from('installations')
                .select('pdf_downloads_count')
                .eq('workspace_id', workspaceId)
                .single();

            if (fetchError || !installation) {
                console.error(`Installation not found in DB: ${workspaceId}`);
                return res.status(500).json({ error: 'Addon installation record missing.' });
            }

            const currentCount = installation.pdf_downloads_count || 0;

            if (currentCount >= DOWNLOAD_LIMIT) {
                return res.status(403).json({ 
                    error: 'Trial limit reached', 
                    message: `You hit 3 PDF downloads limit, please subscribe to the <a href="https://clockify-addons.com/report-to-pdf-addon" target="_blank" style="color: #03a9f4; text-decoration: underline; font-weight: bold;">paid version</a>.` 
                });
            }

            const { error: rpcError } = await supabase.rpc('increment_pdf_download_count', { p_workspace_id: workspaceId });
            if (rpcError) throw rpcError;
        }

        const workspaceResp = await fetch(`${backendUrl}/v1/workspaces/${workspaceId}`, { headers: { "X-Addon-Token": token } });
        if (!workspaceResp.ok) throw new Error(`Workspace fetch failed: ${workspaceResp.status}`);
        const workspaceData = await workspaceResp.json();
        const workspaceName = workspaceData.name || "My Workspace";
        const logoUrl = workspaceData.imageUrl;
        const durationFormat = workspaceData.durationFormat;

        const startDate = new Date(start); startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(end); endDate.setUTCHours(23, 59, 59, 999);

        const clockifyPayload = {
            dateRangeStart: startDate.toISOString(),
            dateRangeEnd: endDate.toISOString(),
            page: 1, pageSize: 5000,
            amountShown: "EARNED", exportType: "JSON",
            detailedFilter: { sortColumn: "DATE", sortOrder: "ASCENDING" }
        };

        if (billableFilter === "billable") { clockifyPayload.billable = true; }
        else if (billableFilter === "nonbillable") { clockifyPayload.billable = false; }
        if (projectFilter && projectFilter.length > 0) { clockifyPayload.projects = { ids: projectFilter, contains: "CONTAINS", status: "ALL" }; }
        if (clientFilter && clientFilter !== "any") { clockifyPayload.clients = { ids: [clientFilter], contains: "CONTAINS", status: "ALL" }; }
        if (!withoutTask && taskFilter && taskFilter.length > 0) { clockifyPayload.tasks = { ids: taskFilter, contains: "CONTAINS", status: "ALL" }; }
        if (withoutDescription) { clockifyPayload.withoutDescription = true; } 
        else if (descriptionFilter && descriptionFilter.trim() !== '') { clockifyPayload.description = descriptionFilter.trim(); }

        const resp = await fetch(`${reportsUrl}/v1/workspaces/${workspaceId}/reports/detailed`, {
            method: "POST",
            headers: { "X-Addon-Token": token, "Content-Type": "application/json" },
            body: JSON.stringify(clockifyPayload)
        });

        if (!resp.ok) throw new Error(`Clockify API error: ${resp.status}`);
        let json = await resp.json();
        
        if (withoutTask && json.timeentries) {
            json.timeentries = json.timeentries.filter(entry => !entry.taskId || entry.taskId === "");
        }
        
        if (preview) { return res.status(200).json({ reportData: json, workspaceSettings: { durationFormat } }); }
        
        const entries = collectEntries(json);
        const rows = entries.map((e) => ({
            date: formatDateDDMMYYYY(e.timeInterval?.start),
            description: e.description || "",
            project: e.projectName || "—",
            task: e.taskName || "",
            amounts: getAmountsMapFromEntry(e),
            amount: formatAmountsMap(getAmountsMapFromEntry(e)),
            durationSeconds: parseISODurationToSeconds(e.timeInterval?.duration),
            quantity: formatDuration(parseISODurationToSeconds(e.timeInterval?.duration), durationFormat),
            unitPrice: e.rate != null ? (e.rate / 100).toFixed(2) : "",
        }));

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const PAGE_WIDTH = 595, PAGE_HEIGHT = 842, MARGIN = 50;
        const usableWidth = PAGE_WIDTH - MARGIN * 2;
        let logoImage = null;
        if (logoUrl) { try { const logoImageBytes = await fetch(logoUrl).then((res) => res.arrayBuffer()); if (logoUrl.endsWith('.png')) { logoImage = await pdfDoc.embedPng(logoImageBytes); } else { logoImage = await pdfDoc.embedJpg(logoImageBytes); } } catch (e) { console.warn("Logo error", e); } }

        const getWrappedLines = (text, f, size, maxWidth) => { const words = String(text).split(' '); const lines = []; let currentLine = words[0] || ''; for (let i = 1; i < words.length; i++) { const word = words[i]; if (f.widthOfTextAtSize(currentLine + ' ' + word, size) < maxWidth) { currentLine += ' ' + word; } else { lines.push(currentLine); currentLine = word; } } lines.push(currentLine); return lines; };

        const allPossibleColumns = [{ key: 'date', label: 'Date', baseWidth: 55 }, { key: 'description', label: 'Description', baseWidth: 100 }, { key: 'project', label: 'Project', baseWidth: 100 }, { key: 'task', label: 'Task', baseWidth: 70 }];
        const fixedRightColumns = [{ key: 'unitPrice', label: 'Unit Price', baseWidth: 55 }, { key: 'quantity', label: 'Quantity', baseWidth: 55 }, { key: 'amount', label: 'Amount', baseWidth: 60 }];
        const activeDynamicCols = allPossibleColumns.filter(c => visibleColumns[c.key]);
        const extraWidthPerActiveCol = activeDynamicCols.length > 0 ? (allPossibleColumns.filter(c => !visibleColumns[c.key]).reduce((sum, c) => sum + c.baseWidth, 0)) / activeDynamicCols.length : 0;
        const finalColumns = [...activeDynamicCols.map(c => ({...c, width: c.baseWidth + extraWidthPerActiveCol })), ...fixedRightColumns.map(c => ({...c, width: c.baseWidth }))];

        const drawTableHeader = (page, yPos, columns) => { page.drawRectangle({ x: MARGIN, y: yPos - 5, width: usableWidth, height: 25, color: rgb(0.92, 0.92, 0.92) }); let currentX = MARGIN; for (const col of columns) { drawText(page, col.label, currentX + 5, yPos, { font: fontBold }); currentX += col.width; } return yPos - 30; };

        let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        let y = PAGE_HEIGHT - MARGIN;

        if (logoImage) { const logoDims = logoImage.scaleToFit(120, 50); page.drawImage(logoImage, { x: PAGE_WIDTH - MARGIN - logoDims.width, y: y - logoDims.height, width: logoDims.width, height: logoDims.height }); }
        const finalIssueDate = issueDate ? new Date(issueDate) : new Date();
        const dueDateString = dueDate ? formatDateDDMMYYYY(new Date(dueDate)) : "upon receipt";
        drawText(page, "Issue date:", MARGIN, y - 20, { font: fontBold });
        drawText(page, formatDateDDMMYYYY(finalIssueDate), MARGIN + 70, y - 20, { font });
        drawText(page, "Due date:", MARGIN, y - 35, { font: fontBold });
        drawText(page, dueDateString, MARGIN + 70, y - 35, { font });
        y -= 100;
        drawText(page, "Bill From", MARGIN, y, { font: fontBold, size: 11 });
        drawText(page, workspaceName, MARGIN, y - 15, { font, size: 10 });
        drawText(page, "Bill To", PAGE_WIDTH / 2 + 50, y, { font: fontBold, size: 11 });
        drawText(page, clientName || 'N/A', PAGE_WIDTH / 2 + 50, y - 15, { font, size: 10 });

        if (clientAddress) { const addressLines = clientAddress.split('\n'); let currentY = y - 30; for (const line of addressLines) { if (line.trim()) { drawText(page, line.trim(), PAGE_WIDTH / 2 + 50, currentY, { font, size: 10 }); currentY -= 12; } } y -= (addressLines.length * 12); }
        y -= 60;
        const subjectText = clientName ? `Invoice for ${clientName}` : "Invoice for Time Report";
        drawText(page, subjectText, (PAGE_WIDTH - fontBold.widthOfTextAtSize(subjectText, 14)) / 2, y, { font: fontBold, size: 14 });
        y -= 40; y = drawTableHeader(page, y, finalColumns);

        const BODY_FONT_SIZE = 9, LINE_HEIGHT = 11, V_PADDING = 9;
        for (const row of rows) {
            let maxLines = 1; const rowLineData = {};
            for (const col of finalColumns) { const lines = getWrappedLines(row[col.key] || '', font, BODY_FONT_SIZE, col.width - 10); rowLineData[col.key] = lines; if (lines.length > maxLines) maxLines = lines.length; }
            const rowHeight = (maxLines * LINE_HEIGHT) + (2 * V_PADDING);
            if (y - rowHeight < MARGIN) { page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; y = drawTableHeader(page, y, finalColumns); }
            let currentX = MARGIN; const textY = y - V_PADDING - (LINE_HEIGHT / 2);
            for (const col of finalColumns) { const lines = rowLineData[col.key] || ['']; lines.forEach((line, j) => { drawText(page, line, currentX + 5, textY - (j * LINE_HEIGHT), { font, size: BODY_FONT_SIZE, maxWidth: col.width - 10 }); }); currentX += col.width; }
            y -= rowHeight; page.drawLine({ start: { x: MARGIN, y: y }, end: { x: MARGIN + usableWidth, y: y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
        }

        const totalsMap = {}; let totalSeconds = 0;
        for (const r of rows) { totalSeconds += r.durationSeconds; for (const cur of Object.keys(r.amounts || {})) { totalsMap[cur] = (totalsMap[cur] || 0) + r.amounts[cur]; } }
        const totalsY = y - 80 < MARGIN ? (page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), PAGE_HEIGHT - MARGIN - 60) : y - 80;
        page.drawRectangle({ x: MARGIN, y: totalsY, width: usableWidth, height: 60, color: rgb(0.92, 0.92, 0.92) });
        drawText(page, `Total Amount: ${formatAmountsMap(totalsMap)}`, MARGIN + 10, totalsY + 35, { size: 11, font: fontBold });
        drawText(page, `Total Duration: ${formatDuration(totalSeconds, durationFormat)}`, MARGIN + 10, totalsY + 15, { size: 11, font });

        if (USER_PAYPAL_LINK) {
            const paypalUrlBase = sanitizePaypalLink(USER_PAYPAL_LINK);
            const firstCur = Object.keys(totalsMap)[0];
            const paypalUrl = firstCur ? `${paypalUrlBase}/${(totalsMap[firstCur] || 0).toFixed(2)}${firstCur}` : paypalUrlBase;
            try {
                const paypalImage = await pdfDoc.embedPng(fs.readFileSync(path.resolve('./lib/paypal-button.png')));
                const btnH = 25, btnW = (btnH / paypalImage.height) * paypalImage.width;
                const btnX = PAGE_WIDTH - MARGIN - btnW - 15, btnY = totalsY + 17;
                page.drawImage(paypalImage, { x: btnX, y: btnY, width: btnW, height: btnH });
                addLinkAnnotation(page, btnX, btnY, btnW, btnH, paypalUrl);
            } catch (err) {
                const btnW = 140, btnX = PAGE_WIDTH - MARGIN - btnW - 15, btnY = totalsY + 17;
                page.drawRectangle({ x: btnX, y: btnY, width: btnW, height: 28, color: rgb(0.1, 0.53, 0.82), borderRadius: 5 });
                drawText(page, "Pay with PayPal", btnX + 25, btnY + 8, { font: fontBold, size: 12, color: rgb(1,1,1) });
                addLinkAnnotation(page, btnX, btnY, btnW, 28, paypalUrl);
            }
        }

        const pdfBytes = await pdfDoc.save();
        const filename = `${clientName?.replace(/\s+/g, '_') || 'Report'}_${start}_${end}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(Buffer.from(pdfBytes));

    } catch (err) {
        console.error("API error:", err.message);
        res.status(500).json({ error: "An unexpected error occurred." });
    }
}
