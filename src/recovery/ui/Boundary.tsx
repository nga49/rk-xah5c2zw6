import { Component, type ReactNode } from 'react';
import { exportFile } from '../../db/store';
import { setModuleEnabled } from '../actions';

/** Keeps a module slot from taking the screen down: on an error it shows one quiet line instead. */
export class SlotBoundary extends Component<{ children: ReactNode; label?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="tiny muted">{this.props.label ?? 'Recovery card'} could not load. The plan is unaffected.</div>;
    return this.props.children;
  }
}

async function download() {
  const file = await exportFile();
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ragnarok-${file.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Last-resort screen for the whole app: export the data, or switch the recovery module off. */
export class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app">
        <main className="main">
          <div className="stack">
            <div className="banner">Something went wrong while drawing the app. Your data is safe on this phone.</div>
            <button className="btn block" onClick={() => void setModuleEnabled(false).then(() => location.reload())}>Switch the recovery module off and reload</button>
            <button className="btn block" onClick={() => void download()}>Export JSON</button>
            <button className="btn block ghost" onClick={() => location.reload()}>Reload</button>
          </div>
        </main>
      </div>
    );
  }
}
