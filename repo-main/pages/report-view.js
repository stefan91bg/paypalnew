// repo-main/pages/report-view.js

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";

// Helper funkcije (bez izmena)
function formatDuration(seconds, format = 'FULL') { seconds = Math.floor(seconds || 0); if (format === 'DECIMAL') { return (seconds / 3600).toFixed(2); } const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; const pad = (n) => String(n).padStart(2, "0"); if (format === 'COMPACT') { return `${h}:${pad(m)}`; } return `${pad(h)}:${pad(m)}:${pad(s)}`; }
function formatDate(isoString) { if (!isoString) return "—"; const d = new Date(isoString); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function extractEntries(node, acc = []) { if (!node || typeof node !== "object") return acc; if (Array.isArray(node.entries)) acc.push(...node.entries); if (Array.isArray(node.timeentries)) acc.push(...node.timeentries); for (const key of Object.keys(node)) { const val = node[key]; if (Array.isArray(val)) val.forEach((child) => extractEntries(child, acc)); else if (typeof val === "object" && val !== null) extractEntries(val, acc); } return acc; }
function getAmountsMapFromEntry(e) { const map = {}; function add(currency, amountInRaw) { if (!currency) currency = "USD"; const cur = String(currency).toUpperCase(); const num = Number(amountInRaw) || 0; const value = num / 100; map[cur] = (map[cur] || 0) + value; } if (e.amounts && Array.isArray(e.amounts)) { for (const it of e.amounts) { if (!it) continue; if (it.amount != null) add(it.currency || e.currency, it.amount); } return map; } if (e.amountByCurrency && Array.isArray(e.amountByCurrency)) { for (const it of e.amountByCurrency) { if (!it) continue; add(it.currency || it.code, it.amount != null ? it.amount : it.value); } return map; } if (e.amount != null) { add(e.currency || "USD", e.amount); } return map; }
function formatAmountsMap(map, joinWith = ", ") { const parts = Object.keys(map).map((cur) => `${map[cur].toFixed(2)} ${cur}`); return parts.join(joinWith) || "0.00 USD"; }

const MultiSelectDropdown = ({ label, options, selectedOptions, onChange, showWithoutOption, withoutOptionState, onWithoutOptionChange = () => {} }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef]);

    useEffect(() => { if(withoutOptionState) onChange([]) }, [withoutOptionState]);

    const filteredOptions = useMemo(() => options.filter(([id, name]) => name.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]);
    const handleSelectAll = () => { onWithoutOptionChange(false); if (selectedOptions.length === options.length) { onChange([]); } else { onChange(options.map(([id]) => id)); } };
    const handleCheckboxChange = (optionId) => { onWithoutOptionChange(false); onChange(prev => prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]); };
    const getButtonLabel = () => {
        if (withoutOptionState) return `Without ${label}`;
        if (selectedOptions.length === 0) return `All ${label}`;
        if (selectedOptions.length === 1) {
            const selected = options.find(([id]) => id === selectedOptions[0]);
            return selected ? selected[1] : "1 selected";
        }
        return `${selectedOptions.length} selected`;
    };

    return (
    <div className="relative w-60" ref={dropdownRef}>
        <button
            type="button"
            className="relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left border border-gray-300 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            onClick={() => setIsOpen(prev => !prev)}
        >
            <span className="block truncate">{getButtonLabel()}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <svg className={`h-5 w-5 text-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 01.53.22l3.5 3.5a.75.75 0 01-1.06 1.06L10 4.81 7.03 7.78a.75.75 0 01-1.06-1.06l3.5-3.5A.75.75 0 0110 3zm-3.72 9.53a.75.75 0 011.06 0L10 15.19l2.97-2.97a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
            </span>
        </button>

        <div className={`absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm ${isOpen ? 'block' : 'hidden'}`}>
            <div className="p-2">
                <input type="text" className="w-full rounded-md border-gray-300 shadow-sm" placeholder={`Search ${label}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <ul className="overflow-y-auto">
                {showWithoutOption && (
                <li className="px-2 border-b pb-1 mb-1">
                    <label className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-md cursor-pointer">
                        <input type="checkbox" checked={withoutOptionState} onChange={(e) => onWithoutOptionChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                        <span className="font-semibold">Without {label}</span>
                    </label>
                </li>
                )}
                <li className="px-2">
                    <label className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-md cursor-pointer">
                        <input type="checkbox" onChange={handleSelectAll} checked={!withoutOptionState && options.length > 0 && selectedOptions.length === options.length} disabled={withoutOptionState} className="h-4 w-4 rounded border-gray-300 text-indigo-600"/>
                        <span className="font-semibold">Select All</span>
                    </label>
                </li>
                {filteredOptions.map(([id, name]) => (
                <li key={id} className="px-2">
                    <label className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-md cursor-pointer">
                        <input type="checkbox" checked={selectedOptions.includes(id)} onChange={() => handleCheckboxChange(id)} disabled={withoutOptionState} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                        <span>{name}</span>
                    </label>
                </li>
                ))}
            </ul>
        </div>
    </div>
    );
};

export default function ReportView() {
    const router = useRouter();
    const [allEntriesForClient, setAllEntriesForClient] = useState([]);
    const [filteredEntries, setFilteredEntries] = useState([]);
    const [totals, setTotals] = useState({ amountStr: "0.00 USD", duration: "00:00:00" });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [durationFormat, setDurationFormat] = useState('FULL');
    const [selectedProjects, setSelectedProjects] = useState([]);
    const [selectedTasks, setSelectedTasks] = useState([]);
    const [descriptionFilter, setDescriptionFilter] = useState('');
    const [withoutTask, setWithoutTask] = useState(false);
    const [withoutDescription, setWithoutDescription] = useState(false);
    const [isApplyingFilters, setIsApplyingFilters] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [pdfColumns, setPdfColumns] = useState({ date: true, description: true, project: true, task: true });
    
    // ✨ NOVO: State promenljiva za praćenje limita
    const [isLimitReached, setIsLimitReached] = useState(false);

    const { start, end, status, paypal, clientId, clientName, clientAddress, issueDate, dueDate, auth_token } = router.query;

    useEffect(() => { if (selectedTasks.length > 0) setWithoutTask(false) }, [selectedTasks]);
    useEffect(() => { if (withoutDescription) setDescriptionFilter('') }, [withoutDescription]);

    const handlePdfColumnChange = (event) => {
        const { name, checked } = event.target;
        setPdfColumns(prev => ({ ...prev, [name]: checked }));
    };

    const mapEntries = (entries, durationFmt) => {
        return entries.map((e) => {
            const durationSeconds = e.timeInterval?.duration ? (typeof e.timeInterval.duration === "number" ? e.timeInterval.duration : 0) : 0;
            const hourlyRate = e.rate != null ? `${(e.rate / 100).toFixed(2)} ${e.currency || ''}`.trim() : "N/A";
            return {
                description: e.description || "(No description)", project: e.projectName || "—", projectId: e.projectId || null, clientName: e.clientName || "No Client", clientId: e.clientId || null, task: e.taskName || "—", taskId: e.taskId || null, tags: e.tags || [],
                amountDisplay: formatAmountsMap(getAmountsMapFromEntry(e)),
                amountsMap: getAmountsMapFromEntry(e),
                duration: formatDuration(durationSeconds, durationFmt),
                durationSeconds: durationSeconds,
                date: formatDate(e.timeInterval?.start),
                hourlyRate: hourlyRate,
            };
        });
    };

    useEffect(() => {
        if (!router.isReady || !clientId || !auth_token) return;
        async function fetchInitialReport() {
            try {
                setLoading(true); setError("");
                const billableFilterValue = status === "billable" ? "billable" : "billable_and_nonbillable";
                const resp = await fetch("/api/reports", {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth_token}` },
                    body: JSON.stringify({ start, end, billableFilter: billableFilterValue, clientFilter: clientId, issueDate, dueDate, preview: true }),
                });
                if (!resp.ok) throw new Error(`Error ${resp.status}: ${await resp.text()}`);
                const { reportData, workspaceSettings } = await resp.json();
                setDurationFormat(workspaceSettings.durationFormat);
                const rawEntries = extractEntries(reportData);
                const mapped = mapEntries(rawEntries, workspaceSettings.durationFormat);
                setAllEntriesForClient(mapped);
                setFilteredEntries(mapped);
            } catch (err) { setError(err.message || "Failed to fetch report data."); }
            finally { setLoading(false); }
        }
        fetchInitialReport();
    }, [router.isReady, start, end, status, clientId, issueDate, dueDate, auth_token]);

    useEffect(() => {
        const totalSeconds = filteredEntries.reduce((sum, e) => sum + e.durationSeconds, 0);
        const totalsMap = filteredEntries.reduce((acc, e) => {
            for (const cur of Object.keys(e.amountsMap || {})) { acc[cur] = (acc[cur] || 0) + e.amountsMap[cur]; }
            return acc;
        }, {});
        setTotals({ amountStr: formatAmountsMap(totalsMap), duration: formatDuration(totalSeconds, durationFormat) });
    }, [filteredEntries, durationFormat]);

    const handleApplyFilters = async () => {
        setIsApplyingFilters(true);
        try {
            const billableFilterValue = status === "billable" ? "billable" : "billable_and_nonbillable";
            const resp = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth_token}` },
                body: JSON.stringify({
                    start, end, billableFilter: billableFilterValue, clientFilter: clientId, projectFilter: selectedProjects,
                    taskFilter: selectedTasks,
                    descriptionFilter: descriptionFilter,
                    withoutTask: withoutTask,
                    withoutDescription: withoutDescription,
                    issueDate, dueDate, preview: true
                }),
            });
            if (!resp.ok) throw new Error(`Error ${resp.status}: ${await resp.text()}`);
            const { reportData, workspaceSettings } = await resp.json();
            const mapped = mapEntries(extractEntries(reportData), workspaceSettings.durationFormat);
            setFilteredEntries(mapped);
        } catch (err) { setError(err.message || "Failed to apply filters."); }
        finally { setIsApplyingFilters(false); }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const resp = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth_token}` },
                body: JSON.stringify({
                    start, end, billableFilter: status === "billable" ? "billable" : "billable_and_nonbillable", projectFilter: selectedProjects,
                    clientFilter: clientId, clientName, clientAddress, taskFilter: selectedTasks,
                    descriptionFilter: descriptionFilter,
                    withoutTask: withoutTask,
                    withoutDescription: withoutDescription,
                    USER_PAYPAL_LINK: paypal,
                    issueDate, dueDate, preview: false, columns: pdfColumns
                }),
            });
            
            // ✨ AŽURIRANA LOGIKA: Postavljamo state i prikazujemo alert
            if (resp.status === 403) {
                const errorData = await resp.json();
                setIsLimitReached(true); // Onemogućavamo dugme
                alert("You hit 3 PDF downloads limit, please subscribe to the payed version.");
                return;
            }

            if (!resp.ok) {
                throw new Error("Failed to generate PDF on the server.");
            }
            
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `report-${start}-to-${end}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            setError(err.message || "Could not generate PDF. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleClearFilters = () => {
        setSelectedProjects([]);
        setSelectedTasks([]);
        setDescriptionFilter('');
        setWithoutTask(false);
        setWithoutDescription(false);
        setFilteredEntries(allEntriesForClient);
    };

    const uniqueProjects = useMemo(() => [...new Map(allEntriesForClient.map((e) => [e.projectId, e.project])).entries()].filter(([pid]) => pid), [allEntriesForClient]);
    const uniqueTasks = useMemo(() => {
        const relevantEntries = selectedProjects.length > 0 ? allEntriesForClient.filter(e => selectedProjects.includes(e.projectId)) : allEntriesForClient;
        return [...new Map(relevantEntries.map(e => [e.taskId, e.task])).entries()].filter(([id, name]) => id && name !== "—");
    }, [allEntriesForClient, selectedProjects]);

    if (loading) return <div className="loading-container"><div className="spinner"></div><p>Loading report...</p></div>;
    if (error) return <div className="container"><div className="error-box">Error: {error}</div></div>;

    return (
    <div className="container">
        <div className="report-card">
            <h1 className="title">Report Preview</h1>
            <p className="subtitle">{start} &mdash; {end}</p>
            <div className="totals-card">
                <div> <span className="totals-label">Total Amount</span> <span className="totals-value">{totals.amountStr}</span> </div>
                <div> <span className="totals-label">Total Duration</span> <span className="totals-value">{totals.duration}</span> </div>
            </div>

            <div className="filters-wrapper">
                {/* ... filteri ostaju isti ... */}
            </div>

            <div className="table-wrapper">
                {/* ... tabela ostaje ista ... */}
            </div>

            <div className="pdf-options-wrapper">
                {/* ... PDF opcije ostaju iste ... */}
            </div>
            
            <div className="actions">
                <button className="back-btn" onClick={() => router.back()}>← Go Back</button>
                
                {/* ✨ AŽURIRANO DUGME I PORUKA */}
                <div className="download-container">
                    <button 
                        className="download-btn" 
                        onClick={handleDownload} 
                        disabled={isDownloading || isLimitReached}
                    >
                        {isDownloading ? 'Generating...' : (isLimitReached ? 'Limit Reached' : 'Download PDF with PayPal Link')}
                    </button>
                    {isLimitReached && (
                        <p className="limit-message">
                            You hit 3 PDF downloads limit, please subscribe to the payed version.
                        </p>
                    )}
                </div>

            </div>
        </div>

        <style jsx global>{` body { background-color: #f4f5f7; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172b4d; } `}</style>
        <style jsx>{`
            /* ... svi ostali stilovi ostaju isti ... */
            .actions { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dfe1e6; }
            .back-btn, .download-btn { border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 15px; transition: all 0.2s; }
            .back-btn { background-color: #e5e7eb; color: #333; }
            .back-btn:hover { background-color: #d1d5db; }
            .download-btn { background-color: #0052cc; color: #fff; }
            .download-btn:hover { background-color: #0065ff; }
            .download-btn:disabled { background: #a5adba; cursor: not-allowed; }
            
            /* ✨ NOVI STILOVI ZA PORUKU O LIMITU */
            .download-container { text-align: right; }
            .limit-message { color: #de350b; font-size: 14px; margin-top: 8px; }
        `}</style>
    </div>
    );
}
