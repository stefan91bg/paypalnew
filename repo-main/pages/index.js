import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const CalendarIcon = () => ( <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> );

export default function Home() {
    const [start, setStart] = useState(null);
    const [end, setEnd] = useState(null);
    const [issueDate, setIssueDate] = useState(null);
    const [dueDate, setDueDate] = useState(null);
    const [status, setStatus] = useState("billable"); 
    const [paypal, setPaypal] = useState("");
    const [errors, setErrors] = useState({});
    const router = useRouter();
    const [isUponReceipt, setIsUponReceipt] = useState(false);
    const [authToken, setAuthToken] = useState(null);
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState("");
    const [isLoadingClients, setIsLoadingClients] = useState(true);
    const [isClientDropdownOpen, setClientDropdownOpen] = useState(false);
    const [clientSearchTerm, setClientSearchTerm] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (!router.isReady) return;

        const tokenFromQuery = router.query.auth_token;
        const tokenFromStorage = sessionStorage.getItem('clockify_auth_token');

        if (tokenFromQuery) {
            sessionStorage.setItem('clockify_auth_token', tokenFromQuery);
            setAuthToken(tokenFromQuery);
        } else if (tokenFromStorage) {
            setAuthToken(tokenFromStorage);
        }
    }, [router.isReady, router.query.auth_token]);

    useEffect(() => {
        if (!authToken) {
            setIsLoadingClients(false);
            return;
        }

        async function fetchClients() {
            setIsLoadingClients(true);
            try {
                const response = await fetch('/api/clients', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                if (!response.ok) throw new Error('Failed to fetch clients');
                const data = await response.json();
                setClients(data);
            } catch (error) {
                console.error(error);
                setErrors(prev => ({ ...prev, clients: 'Could not load clients.' }));
            } finally {
                setIsLoadingClients(false);
            }
        }
        fetchClients();
    }, [authToken]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setClientDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}-${day}-${year}`;
    };

    const validate = () => {
        const newErrors = {};
        if (!start) newErrors.start = "Start date is required";
        if (!end) newErrors.end = "End date is required";
        if (start && end && start > end) {
            newErrors.end = "End date cannot be before start date";
        }
        if (!issueDate) newErrors.issueDate = "Issue date is required";
        if (!dueDate && !isUponReceipt) newErrors.dueDate = "Due date is required";
        if (!selectedClient) newErrors.client = "Client is a required field.";
        if (!paypal.trim()) {
            newErrors.paypal = "PayPal.me link is required";
        } else if (!/^paypal\.me\/[A-Za-z0-9._-]+(\/\w*)?$/.test(paypal.replace(/^https?:\/\//, ''))) {
            newErrors.paypal = "Invalid format, e.g., paypal.me/yourname";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        
        const client = clients.find(c => c.id === selectedClient);
        const clientName = client ? client.name : '';
        const clientAddress = client ? client.address : '';

        router.push({
            pathname: "/report-view",
            query: {
                start: formatDate(start), 
                end: formatDate(end), 
                status, 
                paypal, 
                clientId: selectedClient, 
                clientName,
                clientAddress: clientAddress || '',
                issueDate: formatDate(issueDate), 
                dueDate: isUponReceipt ? '' : formatDate(dueDate), 
                auth_token: authToken 
            },
        });
    };
    
    const handleClientSelect = (clientId) => {
        setSelectedClient(clientId);
        setClientDropdownOpen(false);
        setClientSearchTerm("");
    };

    const selectedClientName = useMemo(() => {
        if (!selectedClient) return "Select Client";
        const client = clients.find(c => c.id === selectedClient);
        return client ? client.name : "Select Client";
    }, [selectedClient, clients]);
    
    const filteredClients = useMemo(() => 
        clients.filter(client => 
            client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()))
    , [clients, clientSearchTerm]);

    const handleSetDatePreset = (preset) => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        let newStart, newEnd;

        switch (preset) {
            case 'this_month':
                newStart = new Date(today.getFullYear(), today.getMonth(), 1);
                newEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'last_month':
                newEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                newStart = new Date(newEnd.getFullYear(), newEnd.getMonth(), 1);
                break;
            case 'this_week':
                const dayOfWeek = today.getDay();
                const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                newStart = new Date(new Date(today).setDate(diffToMonday));
                newEnd = new Date(new Date(newStart).setDate(newStart.getDate() + 6));
                break;
            case 'last_week':
                const dayOfWeekLast = today.getDay();
                const diffToMondayLast = today.getDate() - dayOfWeekLast + (dayOfWeekLast === 0 ? -6 : 1);
                const endOfLastWeek = new Date(new Date(today).setDate(diffToMondayLast - 1));
                const startOfLastWeek = new Date(new Date(endOfLastWeek).setDate(endOfLastWeek.getDate() - 6));
                newStart = startOfLastWeek;
                newEnd = endOfLastWeek;
                break;
            case 'past_two_weeks':
                newEnd = new Date();
                newStart = new Date();
                newStart.setDate(newEnd.getDate() - 14);
                break;
            default:
                return;
        }

        if (newStart && newEnd) {
            setStart(newStart);
            setEnd(newEnd);
        }
    };

    const handleDueDatePreset = (days) => {
        if (!issueDate) {
            setErrors(prev => ({ ...prev, dueDate: "Please select an issue date first." }));
            return;
        }
        const newDueDate = new Date(issueDate);
        newDueDate.setDate(newDueDate.getDate() + days);
        setDueDate(newDueDate);
        setIsUponReceipt(false);
    };

    const handleUponReceipt = () => {
        if (!issueDate) {
            setErrors(prev => ({ ...prev, dueDate: "Please select an issue date first." }));
            return;
        }
        setDueDate(null); 
        setIsUponReceipt(true);
    };

    return (
        <div className="container">
            <div className="report-card">
                <form className="report-generator" onSubmit={handleSubmit}>
                    <h1 className="title">Report Generator</h1>
                    <p className="subtitle">Create and export your time reports with PayPal integration.</p>
                    
                    <div className="form-group">
                        <label>Date Range</label>
                        <div className="date-range-group">
                            <div className="form-group half-width no-margin">
                                <label htmlFor="start" className="sub-label">Start date</label>
                                <div className="input-with-icon">
                                    <DatePicker
                                        id="start"
                                        selected={start}
                                        onChange={(date) => setStart(date)}
                                        dateFormat="MM-dd-yyyy"
                                        placeholderText="MM-DD-YYYY"
                                        className="date-picker-input"
                                        selectsStart
                                        startDate={start}
                                        endDate={end}
                                        // IZMENA: Dodato autoComplete="off"
                                        autoComplete="off"
                                        required
                                    />
                                    <div className="icon-label"><CalendarIcon /></div>
                                </div>
                            </div>
                            <div className="form-group half-width no-margin">
                                <label htmlFor="end" className="sub-label">End date</label>
                                <div className="input-with-icon">
                                    <DatePicker
                                        id="end"
                                        selected={end}
                                        onChange={(date) => setEnd(date)}
                                        dateFormat="MM-dd-yyyy"
                                        placeholderText="MM-DD-YYYY"
                                        className="date-picker-input"
                                        selectsEnd
                                        startDate={start}
                                        endDate={end}
                                        minDate={start}
                                        // IZMENA: Dodato autoComplete="off"
                                        autoComplete="off"
                                        required
                                    />
                                    <div className="icon-label"><CalendarIcon /></div>
                                </div>
                            </div>
                        </div>
                        <div className="presets-group">
                            <button type="button" className="preset-btn" onClick={() => handleSetDatePreset('this_month')}>This Month</button>
                            <button type="button" className="preset-btn" onClick={() => handleSetDatePreset('last_month')}>Last Month</button>
                            <button type="button" className="preset-btn" onClick={() => handleSetDatePreset('this_week')}>This Week</button>
                            <button type="button" className="preset-btn" onClick={() => handleSetDatePreset('last_week')}>Last Week</button>
                            <button type="button" className="preset-btn" onClick={() => handleSetDatePreset('past_two_weeks')}>Past 2 Weeks</button>
                        </div>
                        {errors.start && <div className="error">{errors.start}</div>}
                        {errors.end && <div className="error">{errors.end}</div>}
                    </div>
                    
                    <div className="form-group" ref={dropdownRef}>
                        <label htmlFor="client-filter-btn">Client</label>
                        <button type="button" id="client-filter-btn" className="custom-select-button" onClick={() => setClientDropdownOpen(prev => !prev)} disabled={isLoadingClients || !authToken}>
                            <span>{isLoadingClients ? 'Loading...' : (authToken ? selectedClientName : 'Auth Token Missing')}</span>
                            <span className="arrow">{isClientDropdownOpen ? '▲' : '▼'}</span>
                        </button>
                        {isClientDropdownOpen && !isLoadingClients && (
                            <div className="custom-dropdown-menu">
                                <input type="text" className="search-input" placeholder="Search clients..." value={clientSearchTerm} onChange={(e) => setClientSearchTerm(e.target.value)} autoFocus />
                                <ul className="client-list">
                                    {filteredClients.length > 0 ? filteredClients.map(client => ( <li key={client.id} onClick={() => handleClientSelect(client.id)}>{client.name}</li> )) : ( <li className="no-results">No clients found.</li> )}
                                </ul>
                            </div>
                        )}
                        {errors.client && <div className="error">{errors.client}</div>}
                    </div>

                    <div className="form-group">
                        <label>Invoice Dates</label>
                        <div className="date-range-group">
                            <div className="form-group half-width no-margin">
                                <label htmlFor="issueDate" className="sub-label">Issue date</label>
                                <div className="input-with-icon">
                                    <DatePicker
                                        id="issueDate"
                                        selected={issueDate}
                                        onChange={(date) => setIssueDate(date)}
                                        dateFormat="MM-dd-yyyy"
                                        placeholderText="MM-DD-YYYY"
                                        className="date-picker-input"
                                        // IZMENA: Dodato autoComplete="off"
                                        autoComplete="off"
                                        required
                                    />
                                    <div className="icon-label"><CalendarIcon /></div>
                                </div>
                            </div>
                            <div className="form-group half-width no-margin">
                                <label htmlFor="dueDate" className="sub-label">Due date</label>
                                <div className="input-with-icon">
                                    <DatePicker
                                        id="dueDate"
                                        selected={dueDate}
                                        onChange={(date) => { setDueDate(date); setIsUponReceipt(false); }}
                                        dateFormat="MM-dd-yyyy"
                                        placeholderText={isUponReceipt ? "Upon receipt" : "MM-DD-YYYY"}
                                        className="date-picker-input"
                                        disabled={isUponReceipt}
                                        // IZMENA: Dodato autoComplete="off"
                                        autoComplete="off"
                                    />
                                    <div className="icon-label"><CalendarIcon /></div>
                                </div>
                            </div>
                        </div>
                        <div className="presets-group">
                            <button type="button" className="preset-btn" onClick={handleUponReceipt}>Upon receipt</button>
                            <button type="button" className="preset-btn" onClick={() => handleDueDatePreset(10)}>+10 days</button>
                            <button type="button" className="preset-btn" onClick={() => handleDueDatePreset(15)}>+15 days</button>
                            <button type="button" className="preset-btn" onClick={() => handleDueDatePreset(30)}>+30 days</button>
                            <button type="button" className="preset-btn" onClick={() => handleDueDatePreset(60)}>+60 days</button>
                            <button type="button" className="preset-btn" onClick={() => handleDueDatePreset(90)}>+90 days</button>
                        </div>
                        {errors.issueDate && <div className="error">{errors.issueDate}</div>}
                        {errors.dueDate && <div className="error">{errors.dueDate}</div>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="status">Status</label>
                        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                            <option value="billable">Billable Only</option>
                            <option value="billable_and_nonbillable">Billable & Non-billable</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="paypal">PayPal.me Link</label>
                        <input type="text" id="paypal" placeholder="e.g., paypal.me/yourname" value={paypal} onChange={(e) => setPaypal(e.target.value)} required />
                        {errors.paypal && <div className="error">{errors.paypal}</div>}
                    </div>

                    <button type="submit" disabled={isLoadingClients || !authToken}>Generate Report</button>
                </form>
            </div>
            
            <style jsx global>{` 
                body { background-color: #f0f2f5; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; }
                .react-datepicker-wrapper { width: 100%; }
                .react-datepicker__header { background-color: #0070f3; }
                .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker__day-name { color: white !important; }
            `}</style>
            <style jsx>{`
                .container { display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding-top: 50px; }
                .report-card { background: #ffffff; border-radius: 12px; padding: 35px 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 600px; border: 1px solid #e8e8e8; }
                .title { font-size: 28px; font-weight: 700; text-align: center; margin: 0 0 10px; color: #1a1a1a; }
                .subtitle { font-size: 15px; text-align: center; color: #666; margin-bottom: 30px; }
                .form-group { margin-bottom: 20px; position: relative; }
                .form-group.no-margin { margin-bottom: 0; }
                label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #333; }
                label.sub-label { font-size: 13px; font-weight: normal; color: #555; }
                input, select, :global(.date-picker-input) { 
                    width: 100%; 
                    padding: 12px; 
                    border: 1px solid #ccc; 
                    border-radius: 8px; 
                    font-size: 16px; 
                    font-family: inherit; 
                    background-color: #fdfdfd; 
                    transition: border-color 0.2s, box-shadow 0.2s; 
                    box-sizing: border-box; 
                }
                :global(.date-picker-input::placeholder) { color: #999; }
                :global(.date-picker-input:disabled) { background-color: #e9ecef; cursor: text; }
                input:focus, select:focus, :global(.date-picker-input:focus) { 
                    border-color: #0070f3; 
                    outline: none; 
                    box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.2); 
                }
                .date-range-group { display: flex; gap: 20px; }
                .half-width { flex: 1; }
                .input-with-icon { position: relative; display: flex; align-items: center; }
                .icon-label { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #888; }
                .presets-group { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
                .preset-btn { padding: 6px 10px; font-size: 12px; background-color: #e9ecef; border: 1px solid #dee2e6; border-radius: 6px; cursor: pointer; transition: background-color 0.2s; }
                .preset-btn:hover { background-color: #dee2e6; }
                .custom-select-button { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; background-color: #fdfdfd; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-family: inherit; }
                .custom-select-button:disabled { background-color: #e9ecef; cursor: not-allowed; }
                .custom-select-button .arrow { color: #888; }
                .custom-dropdown-menu { position: absolute; top: 100%; left: 0; width: 100%; background: #fff; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.1); margin-top: 5px; z-index: 1000; max-height: 250px; display: flex; flex-direction: column; }
                .search-input { width: calc(100% - 20px); margin: 10px 10px 5px 10px; padding: 8px 10px; border-radius: 6px; border: 1px solid #ddd; font-size: 14px; }
                .client-list { list-style: none; padding: 0; margin: 5px 0; overflow-y: auto; flex-grow: 1; }
                .client-list li { padding: 10px 15px; cursor: pointer; }
                .client-list li:hover { background-color: #f0f2f5; }
                .client-list li.no-results { color: #888; font-style: italic; cursor: default; }
                .client-list li.no-results:hover { background-color: transparent; }
                button[type="submit"] { display: block; width: 100%; margin-top: 30px; padding: 15px 20px; background-image: linear-gradient(to right, #0070f3, #0059c9); color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
                button[type="submit"]:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0, 112, 243, 0.3); }
                button[type="submit"]:disabled { background-image: none; background-color: #a0c7e4; cursor: not-allowed; transform: none; box-shadow: none; }
                .error { color: #e63946; font-size: 13px; margin-top: 6px; min-height: 15px; }
            `}</style>
        </div>
    );
}
