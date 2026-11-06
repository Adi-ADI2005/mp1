const defaultMessage = "AI is analyzing the fish...";

export default function AiAnalysisLoader({
  message = defaultMessage,
  detail = "Running computer vision model",
}) {
  return (
    <div className="ai-analysis-loader" role="status" aria-live="polite">
      <div className="loader" aria-hidden="true">
        <div className="dot dot-1" />
        <div className="dot dot-2" />
        <div className="dot dot-3" />
        <div className="dot dot-4" />
        <div className="dot dot-5" />
      </div>
      <strong>{message}</strong>
      <span>{detail}</span>
    </div>
  );
}
