import { useEffect, useState } from 'react';
import { Download, FileDown, FilePlus2, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { poolsApi, reportsApi } from '../services/api';
import { apiMessage, formatDate, getRows, poolLabel } from '../services/format';
import { Field, LoadingBlock, Modal, PageHeading, Panel, StateBox } from '../components/UI';
import { useToast } from '../context/ToastContext';

const reportTypes = [
  { value: 'farm', label: 'Complete farm report' },
  { value: 'pool', label: 'Pool report' },
  { value: 'species', label: 'Species report' },
  { value: 'disease', label: 'Disease screening report' },
  { value: 'camera', label: 'Camera report' },
  { value: 'population', label: 'Fish population report' },
];
function reportId(report) {
  return report.id ?? report.report_id;
}
export function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState('farm');
  const [format, setFormat] = useState('pdf');
  const [poolId, setPoolId] = useState('');
  const notify = useToast();
  const load = async () => {
    setLoading(true);
    const [reportResponse, poolResponse] = await Promise.allSettled([reportsApi.list(), poolsApi.list()]);
    if (reportResponse.status === 'fulfilled') { setReports(getRows(reportResponse.value)); setError(''); }
    else setError(apiMessage(reportResponse.reason));
    if (poolResponse.status === 'fulfilled') setPools(getRows(poolResponse.value));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const generate = async (event) => {
    event.preventDefault();
    setGenerating(true);
    try {
      const payload = { type, format };
      if (poolId) payload.pool_id = poolId;
      const generated = await reportsApi.generate(payload);
      notify(`Report ${generated.id ? `#${generated.id} ` : ''}queued for generation.`, 'success');
      setModalOpen(false);
      if (generated.id || generated.report_id) setReports((current) => [{ ...generated, type, format, status: generated.status || 'processing', created_at: generated.created_at || new Date().toISOString() }, ...current]);
      await load();
    } catch (requestError) { notify(apiMessage(requestError), 'error'); }
    finally { setGenerating(false); }
  };
  const download = async (report) => {
    const id = reportId(report);
    setDownloading(id);
    try {
      const blob = await reportsApi.download(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = report.filename || `${(report.type || 'farm-report').toLowerCase().replaceAll(' ', '-')}-${id}.${report.format || 'pdf'}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Report download started.', 'success');
    } catch (requestError) { notify(apiMessage(requestError, 'Could not download report.'), 'error'); }
    finally { setDownloading(null); }
  };
  return <>
    <PageHeading eyebrow="Farm records" title="Reports" subtitle="Generate and retrieve operational summaries for the work ahead." action={<button className="btn-aqua" onClick={() => setModalOpen(true)}><FilePlus2 size={15} />Generate report</button>} />
    {loading ? <LoadingBlock count={3} /> : error ? <div className="surface"><StateBox type="error" title="Report library unavailable" message={error} action={<button className="btn-quiet" onClick={load}>Retry</button>} /></div> : <Panel title="Report library" meta={`${reports.length} REPORT${reports.length === 1 ? '' : 'S'}`} action={<button className="btn-quiet" onClick={load}><RefreshCw size={13} />Refresh</button>}>
      {reports.length ? reports.map((report, index) => {
        const id = reportId(report);
        const ready = !['processing', 'pending', 'queued', 'generating'].includes(String(report.status || '').toLowerCase());
        return <div className="report-row" key={id ?? index}><div className="report-icon"><FileText size={17} /></div><div className="report-info"><div className="report-name">{report.name || report.title || report.label || `${(report.type || 'Farm').replaceAll('_', ' ')} report`}</div><div className="report-meta">{[formatDate(report.created_at || report.generated_at), report.format?.toUpperCase(), report.pool_name || (report.pool_id ? poolLabel(pools.find((pool) => String(pool.id ?? pool.pool_id) === String(report.pool_id)) || { name: `Pool ${report.pool_id}` }) : 'All pools')].filter(Boolean).join(' · ')}</div></div><span className={`tag ${ready ? '' : 'tag-warn'}`}>{report.status || 'READY'}</span><button className="btn-quiet" disabled={!ready || downloading === id || id == null} onClick={() => download(report)}>{downloading === id ? <LoaderCircle size={13} /> : <Download size={13} />}Download</button></div>;
      }) : <StateBox title="No reports generated" message="Create a report to turn farm activity into a shareable record." action={<button className="btn-aqua" onClick={() => setModalOpen(true)}><FilePlus2 size={14} />Generate first report</button>} />}
    </Panel>}
    {modalOpen && <Modal title="Generate a report" onClose={() => setModalOpen(false)}><form onSubmit={generate}>
      <Field id="report-type" label="Report scope"><select id="report-type" value={type} onChange={(event) => setType(event.target.value)}>{reportTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></Field>
      <Field id="report-format" label="File format"><select id="report-format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="pdf">PDF document</option><option value="csv">CSV spreadsheet</option></select></Field>
      <Field id="report-pool" label="Pool filter"><select id="report-pool" value={poolId} onChange={(event) => setPoolId(event.target.value)}><option value="">All pools</option>{pools.map((pool) => <option key={pool.id ?? pool.pool_id} value={pool.id ?? pool.pool_id}>{poolLabel(pool)}</option>)}</select></Field>
      <div className="modal-actions"><button type="button" className="btn-quiet" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn-aqua" disabled={generating} type="submit">{generating ? <><LoaderCircle size={14} />Generating</> : <><FileDown size={14} />Generate</>}</button></div>
    </form></Modal>}
  </>;
}