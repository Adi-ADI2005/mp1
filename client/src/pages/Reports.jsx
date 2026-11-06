import { useEffect, useState } from "react";
import { ArrowDownToLine, Download, FileBarChart2, FileSpreadsheet, FileText, Plus, RefreshCcw } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useToast } from "../context";
import { EmptyState, FormField, LoadingBlock, Modal, PageHeading, Panel, StatusBadge } from "../components/common";

const reportTypes = ["Farm overview", "Pool report", "Fish population report", "Species report", "Disease review", "Camera monitoring"];

export default function Reports() {
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ report_type: "Farm overview", format: "csv", pool_id: "" });
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      const [reportResponse, poolResponse] = await Promise.all([api.get("/reports"), api.get("/pools")]);
      setReports(reportResponse.data);
      setPools(poolResponse.data);
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  const generate = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post("/reports/generate", {
        ...form, pool_id: form.pool_id || null,
      }, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const disposition = response.headers["content-disposition"] || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `fishcheck-report.${form.format}`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`${form.format.toUpperCase()} report generated and downloaded.`);
      setShowForm(false);
      refresh();
    } catch (error) {
      let message = getErrorMessage(error);
      if (error.response?.data instanceof Blob) {
        try { message = JSON.parse(await error.response.data.text()).detail || message; } catch { /* Keep default. */ }
      }
      toast.error(message);
    } finally { setBusy(false); }
  };
  if (loading) return <LoadingBlock label="Loading reports…" />;
  return (
    <div>
      <PageHeading eyebrow="FARM RECORDS" title="Reports" description="Generate and download pool and farm monitoring summaries." action={<button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Create report</button>} />
      <div className="report-options-grid">{[["Farm overview", "Pools, water conditions, camera status, and health flags.", FileBarChart2], ["Pool report", "A single pool’s current stock and monitored conditions.", FileText], ["Fish population report", "Recorded fish baselines by pool and species.", FileSpreadsheet]].map(([title, copy, Icon]) => <button className="report-option-card" key={title} onClick={() => { setForm({ report_type: title, format: "csv", pool_id: "" }); setShowForm(true); }}><span className="report-option-icon"><Icon size={17} /></span><strong>{title}</strong><p>{copy}</p><span className="panel-link">Create report <i className="bi bi-arrow-right" /></span></button>)}</div>
      <Panel title="Recent reports" subtitle="Report history for this workspace" action={<button className="icon-button" onClick={refresh} title="Refresh reports"><RefreshCcw size={15} /></button>}>
        {reports.length ? <div className="responsive-table"><table><thead><tr><th>Report</th><th>Type</th><th>Format</th><th>Created</th><th>Status</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><span className="report-table-name"><span className="report-table-icon">{report.format === "pdf" ? <FileText size={15} /> : <FileSpreadsheet size={15} />}</span><span>{report.filename}</span></span></td><td>{report.report_type}</td><td><span className="format-tag">{report.format.toUpperCase()}</span></td><td>{new Date(report.created_at).toLocaleString()}</td><td><StatusBadge value="online">Ready</StatusBadge></td></tr>)}</tbody></table></div> : <EmptyState icon={FileBarChart2} title="No reports generated yet" description="Create a farm or pool report and download it as CSV or PDF." action={<button className="btn-secondary" onClick={() => setShowForm(true)}><Plus size={15} /> Create a report</button>} />}
      </Panel>
      <div className="report-note"><i className="bi bi-info-circle" /><span>Reports include recorded pool and camera details. Fish sizing and biomass are shown as unavailable until validated measurements are configured.</span></div>
      {showForm && <Modal title="Generate a report" subtitle="Choose the information and download format to include." onClose={() => setShowForm(false)}><form className="entity-form" onSubmit={generate}><FormField label="Report type"><select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })}>{reportTypes.map((type) => <option key={type}>{type}</option>)}</select></FormField><FormField label="Pool filter"><select value={form.pool_id} onChange={(e) => setForm({ ...form, pool_id: e.target.value })}><option value="">All pools</option>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.id} · {pool.name}</option>)}</select></FormField><FormField label="Download format"><div className="format-selector">{[["csv", FileSpreadsheet, "CSV spreadsheet"], ["pdf", FileText, "PDF document"]].map(([value, Icon, text]) => <button key={value} type="button" className={form.format === value ? "selected" : ""} onClick={() => setForm({ ...form, format: value })}><Icon size={16} /><span>{text}</span></button>)}</div></FormField><div className="form-actions"><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? "Generating…" : <><Download size={15} /> Download report</>}</button></div></form></Modal>}
    </div>
  );
}