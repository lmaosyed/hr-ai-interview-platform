import { FileVideo, MonitorPlay, MicVocal, ScanFace } from "lucide-react";

type Props = {
  onStart: () => void | Promise<void>;
};

export function ConsentPanel({ onStart }: Props) {
  return (
    <section className="interview-card">
      <div className="section-heading">
        <span className="eyebrow">Step 2</span>
        <h2>Recording consent</h2>
      </div>
      <p className="muted-copy">
        This session records interview evidence for later AI processing and HR review.
      </p>
      <ul className="consent-list">
        <li>
          <FileVideo size={18} />
          Webcam video is recorded as a separate stream.
        </li>
        <li>
          <MonitorPlay size={18} />
          You must share your entire screen and keep the interview in fullscreen mode.
        </li>
        <li>
          <MicVocal size={18} />
          Microphone audio is recorded for speech-to-text and communication analysis.
        </li>
        <li>
          <ScanFace size={18} />
          Proctoring events such as tab switches, fullscreen exits, and suspicious activity are logged.
        </li>
      </ul>
      <button className="primary-button" onClick={() => void onStart()}>
        I understand, begin interview
      </button>
    </section>
  );
}
