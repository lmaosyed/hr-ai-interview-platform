import { Camera, Monitor, Mic, ShieldCheck } from "lucide-react";

type Props = {
  webcam: boolean;
  mic: boolean;
  screen: boolean;
  error?: string;
  onRunCheck: () => void | Promise<void>;
};

export function DeviceCheckPanel({ webcam, mic, screen, error, onRunCheck }: Props) {
  return (
    <section className="interview-card">
      <div className="section-heading">
        <span className="eyebrow">Step 1</span>
        <h2>Device pre-check</h2>
      </div>
      <p className="muted-copy">
        Before the interview begins, confirm camera, microphone, and your entire screen
        are available in this browser. Window-only sharing is not allowed.
      </p>
      <div className="device-grid">
        <div className={`device-chip ${webcam ? "success" : ""}`}>
          <Camera size={18} />
          Webcam
        </div>
        <div className={`device-chip ${mic ? "success" : ""}`}>
          <Mic size={18} />
          Microphone
        </div>
        <div className={`device-chip ${screen ? "success" : ""}`}>
          <Monitor size={18} />
          Screen share
        </div>
      </div>
      {error ? <p className="status-error">{error}</p> : null}
      <button className="primary-button" onClick={() => void onRunCheck()}>
        <ShieldCheck size={18} />
        Run Device Check
      </button>
    </section>
  );
}
