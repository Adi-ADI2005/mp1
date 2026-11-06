import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowDownToLine, Camera, Check, CheckCircle2, FileVideo2, Fish, FlaskConical, ImagePlus, LoaderCircle, Play, RotateCcw, ShieldAlert, Sparkles, Upload, Video, VideoOff, X } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useToast } from "../context";
import { EmptyState, FormField, PageHeading, Panel, StatusBadge } from "../components/common";

const readable = (label) => label ? label.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable";

function Prediction({ label, result, tone, icon: Icon }) {
  const confidence = result?.confidence;
  return (
    <div className={`prediction-card prediction-${tone}`}>
      <div className="prediction-top"><span className="prediction-icon"><Icon size={17} /></span><span>{label}</span><StatusBadge value={result?.available ? "online" : "unknown"}>{result?.available ? "Model ready" : "Unavailable"}</StatusBadge></div>
      <strong className="prediction-label">{result?.available ? readable(result.label) : "Not available"}</strong>
      {confidence != null ? <><div className="prediction-confidence"><div><span>Confidence</span><b>{Math.round(confidence * 100)}%</b></div><div className="confidence-track"><i style={{ width: `${Math.max(0, Math.min(100, confidence * 100))}%` }} /></div></div>{result.top_predictions?.length > 1 && <div className="top-predictions">{result.top_predictions.slice(1).map((item) => <div key={item.label}><span>{readable(item.label)}</span><b>{Math.round(item.confidence * 100)}%</b></div>)}</div>}</> : <p className="prediction-unavailable">The bundled classifier could not be loaded in this environment.</p>}
    </div>
  );
}

function ResultView({ result, onReset, sourceFile }) {
  const toast = useToast();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fishcheck-analysis-${result.analysis_id?.slice(0, 8) || "result"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const generatePdf = async () => {
    try {
      const response = await api.post("/reports/generate", { report_type: "Fish analysis report", format: "pdf", pool_id: result.pool_id || null }, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "fishcheck-analysis-report.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Analysis report downloaded.");
    } catch (error) { toast.error(getErrorMessage(error)); }
  };
  return (
    <div className="analysis-results">
      <div className="results-toolbar"><div className="results-success"><CheckCircle2 size={17} /><span><strong>Analysis saved</strong><small>{new Date(result.created_at || Date.now()).toLocaleString()} · {result.latency_ms} ms</small></span></div><div className="results-actions"><button className="btn-secondary compact" onClick={exportJson}><ArrowDownToLine size={14} /> JSON</button><button className="btn-secondary compact" onClick={generatePdf}><FileVideo2 size={14} /> Report</button><button className="btn-quiet compact-quiet" onClick={onReset}><RotateCcw size={14} /> Analyze again</button></div></div>
      <div className="results-summary-grid">
        <div className="result-summary"><span>Fish count</span><strong>{result.fish_count == null ? "—" : result.fish_count}</strong><small>{result.fish_count == null ? "Detector not configured" : "Detected fish"}</small></div>
        <div className="result-summary"><span>Estimated length</span><strong>{result.estimated_length_cm == null ? "—" : `${result.estimated_length_cm} cm`}</strong><small>Camera calibration required</small></div>
        <div className="result-summary"><span>Estimated height</span><strong>{result.estimated_height_cm == null ? "—" : `${result.estimated_height_cm} cm`}</strong><small>Detector and calibration required</small></div>
        <div className="result-summary"><span>Estimated weight</span><strong>{result.estimated_weight_g == null ? "—" : `${result.estimated_weight_g} g`}</strong><small>Validated estimator required</small></div>
      </div>
      <div className="prediction-grid"><Prediction label="Species classification" result={result.species} tone="mint" icon={Fish} /><Prediction label="Health screening" result={result.health} tone="blue" icon={ShieldAlert} /></div>
      <div className="analysis-limitations">
        {result.fish_count == null
          ? <p>Individual fish detection, counting, and bounding boxes are unavailable because no trained fish-detection model is configured.</p>
          : result.fish_count === 0
            ? <p>No fish detected in this image.</p>
            : <p>Fish count: {result.fish_count}. Bounding-box output: {result.detections?.length ? "available" : "not returned by the configured model"}.</p>}
        <p>Prediction time: {Number.isFinite(result.latency_ms) ? `${result.latency_ms} ms` : "not reported"}.</p>
      </div>
      {sourceFile && <div className="result-source"><ImagePlus size={14} /> Source: {sourceFile}</div>}
      <div className="analysis-limitations"><div><AlertTriangle size={16} /><strong>What these results mean</strong></div><ul>{(result.limitations || []).map((item) => <li key={item}>{item}</li>)}</ul><p>Disease predictions are preliminary and are not a diagnosis. Have a qualified aquaculture or marine expert review any concern.</p></div>
    </div>
  );
}

export default function Analysis() {
  const toast = useToast();
  const [pools, setPools] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [poolId, setPoolId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [mode, setMode] = useState("image");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    Promise.allSettled([api.get("/pools"), api.get("/cameras")]).then(([poolResult, cameraResult]) => {
      if (poolResult.status === "fulfilled") {
        const rows = poolResult.value.data || [];
        setPools(rows);
        if (rows[0]) setPoolId(rows[0].id);
      } else {
        toast.error(getErrorMessage(poolResult.reason));
      }
      if (cameraResult.status === "fulfilled") {
        setCameras(cameraResult.value.data || []);
      } else {
        toast.error(getErrorMessage(cameraResult.reason));
      }
    });
  }, []);
  useEffect(() => {
    if (!poolId) {
      setCameraId("");
      return;
    }
    const pool = pools.find((item) => String(item.id) === String(poolId));
    const linkedCameras = cameras.filter((item) => String(item.pool_id) === String(poolId));
    const preferred = linkedCameras.find((item) => String(item.id) === String(pool?.camera_id)) || linkedCameras[0];
    setCameraId(preferred?.id || "");
  }, [poolId, pools, cameras]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);
  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);

  const setSelectedFile = (selected) => {
    if (!selected) return;
    const isVideo = mode === "video";
    const supportedTypes = isVideo
      ? ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska"]
      : ["image/jpeg", "image/png", "image/webp"];
    const extension = selected.name.toLowerCase().split(".").pop();
    const supportedExtensions = isVideo
      ? ["mp4", "mov", "avi", "webm", "mkv"]
      : ["jpg", "jpeg", "png", "webp"];
    const maxBytes = (isVideo ? 50 : 10) * 1024 * 1024;
    if (!supportedExtensions.includes(extension)
      || (selected.type && !supportedTypes.includes(selected.type))
      || selected.size > maxBytes
      || selected.size === 0) {
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview("");
      if (fileRef.current) fileRef.current.value = "";
      setAnalysisError(selected.size > maxBytes
        ? `The selected file exceeds the ${isVideo ? "50 MB" : "10 MB"} upload limit.`
        : "Choose a non-empty JPEG, PNG, or WebP image, or a supported video.");
      return;
    }
    setAnalysisError("");
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support webcam access.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraStream(stream);
    } catch (error) {
      const message = error.name === "NotAllowedError" ? "Allow camera access in your browser, then try again." : error.message;
      setCameraError(message);
      toast.error(message);
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  const captureFrame = () => new Promise((resolve, reject) => {
    if (!videoRef.current?.videoWidth) return reject(new Error("The camera is not ready yet."));
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => blob ? resolve(new File([blob], "webcam-capture.jpg", { type: "image/jpeg" })) : reject(new Error("Could not capture a camera frame.")), "image/jpeg", .92);
  });

  const analyze = async (event) => {
    event.preventDefault();
    if (busy) return;
    let upload = file;
    if (mode === "webcam") {
      try { upload = await captureFrame(); }
      catch (error) { toast.error(error.message); return; }
    }
    if (!upload) { toast.warning(mode === "video" ? "Choose a video to analyze." : "Choose an image to analyze."); return; }
    setBusy(true);
    setResult(null);
    setAnalysisError("");
    const body = new FormData();
    body.append(mode === "video" ? "video" : "image", upload);
    if (poolId) body.append("pool_id", poolId);
    if (cameraId) body.append("camera_id", cameraId);
    try {
      const endpoint = mode === "video" ? "/analysis/video" : "/analysis/image";
      const { data } = await api.post(endpoint, body);
      setResult({ ...data, pool_id: poolId || null, camera_id: cameraId || null });
      toast.success("Fish image analysis completed and saved.");
    } catch (error) {
      const message = getErrorMessage(error, "Could not analyze this file.");
      setAnalysisError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setResult(null); setFile(null); setPreview(""); setAnalysisError(""); };
  const accept = mode === "video" ? "video/mp4,video/quicktime,video/webm,video/x-msvideo,.mkv" : "image/jpeg,image/png,image/webp";
  const modeOptions = useMemo(() => [
    { id: "image", label: "Image", icon: ImagePlus }, { id: "video", label: "Video", icon: FileVideo2 }, { id: "webcam", label: "Webcam", icon: Camera },
  ], []);

  return (
    <div>
      <PageHeading eyebrow="IMAGE & VIDEO CLASSIFICATION" title="AI analysis" description="Upload a fish photo or video, or capture a frame from your browser camera." action={<span className="analysis-model-tag"><Sparkles size={14} /> EfficientNet classifiers</span>} />
      <div className="analysis-layout">
        <Panel title="New analysis" subtitle="Choose a source, pool, and optional camera for this result." className="analysis-input-panel">
          <div className="analysis-tabs">{modeOptions.map(({ id, label, icon: Icon }) => <button key={id} className={mode === id ? "active" : ""} onClick={() => { setMode(id); setResult(null); setFile(null); setPreview(""); setAnalysisError(""); setCameraError(""); if (fileRef.current) fileRef.current.value = ""; }}><Icon size={15} />{label}</button>)}</div>
          <form onSubmit={analyze}>
            <FormField label="Pool"><select value={poolId} onChange={(event) => setPoolId(event.target.value)}><option value="">No pool association</option>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.id} · {pool.name}</option>)}</select></FormField>
            <FormField label="Camera source"><select value={cameraId} onChange={(event) => setCameraId(event.target.value)} disabled={!poolId}><option value="">{poolId ? "No camera selected" : "Select a pool first"}</option>{cameras.filter((camera) => String(camera.pool_id) === String(poolId)).map((camera) => <option key={camera.id} value={camera.id}>{camera.id} · {camera.name}</option>)}</select></FormField>
            {mode !== "webcam" ? (
              <div className={`upload-zone ${dragging ? "upload-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setSelectedFile(event.dataTransfer.files[0]); }}>
                {preview ? <div className="upload-preview">{mode === "video" ? <video src={preview} controls /> : <img src={preview} alt="Selected fish for analysis" />}<button className="preview-remove" type="button" onClick={() => { setFile(null); setPreview(""); }} aria-label="Remove selected file"><X size={15} /></button><div className="preview-file-name">{file?.name}</div></div> : <><span className="upload-icon"><Upload size={19} /></span><strong>Drop your {mode} here</strong><span>or browse files from your device</span><small>{mode === "video" ? "MP4, MOV, AVI, WebM · up to 50 MB" : "JPEG, PNG or WebP · up to 10 MB"}</small><button type="button" className="btn-secondary compact" onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Browse files</button></>}
                <input ref={fileRef} hidden type="file" accept={accept} onChange={(event) => setSelectedFile(event.target.files[0])} />
              </div>
            ) : (
              <div className="webcam-panel">{cameraStream ? <><video ref={videoRef} className="webcam-preview" autoPlay muted playsInline /><button type="button" className="camera-stop" onClick={stopCamera}><VideoOff size={14} /> Stop camera</button></> : <><div className="webcam-placeholder"><Camera size={26} /><span>Browser camera</span><small>Preview starts only after you grant camera access.</small></div>{cameraError && <div className="stream-error">{cameraError}</div>}<button type="button" className="btn-secondary compact" onClick={startCamera}><Video size={14} /> Start camera</button></>}</div>
            )}
            {busy && <div className="analysis-progress" role="status" aria-live="polite"><div><span>{mode === "video" ? "Extracting frames and running classifiers…" : mode === "webcam" ? "Analyzing webcam frame…" : "Analyzing fish image…"}</span></div><div className="progress-track"><i className="progress-indeterminate" /></div></div>}
            <div className="analysis-privacy-note"><ShieldAlert size={15} /><span>Uploads are analyzed in memory and results are saved to the selected farm workspace.</span></div>
            <button type="submit" className="btn-primary run-analysis" disabled={busy || (mode === "webcam" && !cameraStream)}>{busy ? <><LoaderCircle size={15} className="spin" /> Analyzing…</> : <><Play size={15} fill="currentColor" /> {mode === "webcam" ? "Capture & analyze frame" : "Start analysis"}</>}</button>
          </form>
        </Panel>
        <div className="analysis-result-column">
          {analysisError ? <Panel title="Analysis unavailable"><div className="analysis-error-message" role="alert"><strong>Prediction failed. Please try another image.</strong><span>{analysisError}</span></div></Panel> : result ? <ResultView result={result} sourceFile={mode === "webcam" ? "Browser camera frame" : file?.name} onReset={reset} /> : (
            <Panel title="Analysis output" subtitle="Your classifications and confidence scores will appear here.">
              <div className="analysis-empty">
                <div className="analysis-empty-graphic"><span className="scan-corner corner-a" /><span className="scan-corner corner-b" /><span className="scan-corner corner-c" /><span className="scan-corner corner-d" /><div className="scan-fish"><Fish size={50} strokeWidth={1.1} /></div><div className="scan-line" /></div>
                <h3>Ready when you are</h3><p>Choose a clear fish image. The bundled species and health classifiers will evaluate it when available.</p>
                <div className="output-ready-items"><span><Check size={13} /> Species classification</span><span><Check size={13} /> Preliminary health screening</span><span className="not-ready"><X size={13} /> Count & measurements require additional models</span></div>
              </div>
            </Panel>
          )}
          <div className="analysis-disclaimer"><AlertTriangle size={15} /><span>AI health results are preliminary and are not a veterinary diagnosis. Review concerns with a qualified aquaculture or marine expert.</span></div>
        </div>
      </div>
    </div>
  );
}