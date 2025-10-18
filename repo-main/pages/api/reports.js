// repo-main/pages/api/reports.js

import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { verifyToken } from '../../lib/auth';
import { supabase } from '../../lib/supabaseClient'; 
import fs from 'fs';
import path from 'path';

// Helper funkcije (ostaju iste)
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
        const decodedToken = verifyToken(token);
        const { workspaceId, reportsUrl, backendUrl } = decodedToken;
        
        // =======================================================
        // ✨ LOGIKA ZA PROVERU FREE TRIAL LIMITE (3)
        // =======================================================
        const { preview } = req.body;
        
        if (!preview) {
            const DOWNLOAD_LIMIT = 3; 

            // 1. Dohvatanje trenutnog brojača za dati Workspace (SELECT)
            const { data: installation, error: fetchError } = await supabase
                .from('installations')
                .select('pdf_downloads_count')
                .eq('workspace_id', workspaceId)
                .single();

            // Privremeno logovanje grešaka za debug (možeš ovo da obrišeš nakon testiranja)
            // console.log("Supabase fetch result:", { installation, fetchError }); 

            if (fetchError || !installation) {
                // Ako instalacija nije pronađena (ili je SELECT pucao)
                console.error(`Installation not found in DB for workspace: ${workspaceId}. Fetch Error:`, fetchError?.message || 'N/A');
                return res.status(500).json({ error: 'Addon installation record missing or DB fetch failed.' });
            }

            const currentCount = installation.pdf_downloads_count || 0;

            // 2. Provera da li je limit dostignut
            if (currentCount >= DOWNLOAD_LIMIT) {
                // Vraćamo 403 Forbidden status
                return res.status(403).json({ 
                    error: 'Trial limit reached', 
                    message: `You hit the limit of ${DOWNLOAD_LIMIT} PDF downloads. Subscribe to the paid version to continue.` 
                });
            }

            // 3. Povećanje brojača za 1 pre generisanja PDF-a (PRIVREMENO KOMENTARISANO)
            /*
            const { error: updateError } = await supabase
                .from('installations')
                .update({ pdf_downloads_count: currentCount + 1 })
                .eq('workspace_id', workspaceId);

            if (updateError) {
                console.error(`Failed to update download count for workspace ${workspaceId}:`, updateError);
                return res.status(500).json({ error: 'Database update failed. Cannot complete download.' });
            }
            */
        }
        // =======================================================
        // ✨ KRAJ LOGIKE ZA LIMIT
        // =======================================================
        
        const { start, end, USER_PAYPAL_LINK, billableFilter, projectFilter, clientFilter, clientName, clientAddress, taskFilter, descriptionFilter, withoutTask, withoutDescription, issueDate, dueDate, columns: visibleColumns = { date: true, description: true, project: true, task: true } } = req.body;

        const workspaceResp = await fetch(`${backendUrl}/v1/workspaces/${workspaceId}`, { headers: { "X-Addon-Token": token } });
        if (!workspaceResp.ok) throw new Error(`Could not fetch workspace details. Status: ${workspaceResp.status}`);
        const workspaceData = await workspaceResp.json();
// ... (ostatak koda za generisanje reporta ostaje nepromenjen)
// ...
