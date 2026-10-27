import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from './db';
import { exitDemo } from './demo';
import { go } from './router';

interface Step {
  title: string;
  text: string;
  route: (ids: Record<string, string>) => string;
}

/** The guided demo: each step opens a screen and explains it in a sentence or two. */
const STEPS: Step[] = [
  { title: 'Every ministry gets its own budget', route: () => '/',
    text: 'The church gives an amount to a person, team or task. The ring shows what is left: amber when it runs low, red when it is overspent.' },
  { title: 'One budget, at a glance', route: (ids) => `/budget/${ids.kenya}`,
    text: "Ruth's mission trip: what was given, spent and waiting for approval, with warnings before money or time runs out." },
  { title: 'Snap a receipt', route: (ids) => `/add?budget=${ids.kenya}`,
    text: 'Take a photo, pick one from the gallery, or paste an emailed receipt. The app reads the store, date and total. Tap "Try a sample receipt" to see it.' },
  { title: 'Approve and pay back', route: () => '/approvals',
    text: 'The treasurer approves or rejects each expense. When someone used their own money, the app tracks the payback until it is paid.' },
  { title: 'A ledger like a bank statement', route: () => '/ledger',
    text: 'Every dollar given, spent, paid back or returned, in order with a running balance. Export it to a spreadsheet any time.' },
  { title: 'Report back and close out', route: (ids) => `/report/${ids.vbs}`,
    text: 'When the work is done the budget is closed. Unspent money goes back to the church, and the report prints or saves as a PDF to sign.' },
  { title: 'Rewards and backup', route: () => '/more',
    text: 'People who save church money earn points on the leaderboard. Data stays on the phone and backs up to their own Google Drive, like WhatsApp.' },
  { title: "See a missionary's view", route: () => '/more',
    text: 'Under "Using the app as", switch to Ruth Mensah to see what a missionary sees: only her budgets and her expenses.' },
];

export default function Tour() {
  const step = useLiveQuery(() => getSetting('device.tourStep', -1), [], -1);
  const ids = useLiveQuery(async () => {
    const budgets = await db.budgets.toArray();
    const find = (name: string) => budgets.find((b) => b.name === name && b.status === 'active')?.id ?? budgets.find((b) => b.name === name)?.id ?? '';
    return { kenya: find('Kenya mission trip'), vbs: find('Vacation Bible School') };
  });
  const open = step >= 0 && step < STEPS.length;

  useEffect(() => {
    document.body.classList.toggle('touring', open);
    // Navigate only when the step changes, not every time the data does.
    if (open && ids) go(STEPS[step].route(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open, ids?.kenya, ids?.vbs]);

  const to = (n: number) => setSetting('device.tourStep', n);

  if (!open) {
    return (
      <div className="demo-bar">
        <span>Demo mode</span>
        <button onClick={() => to(0)}>Restart tour</button>
        <button onClick={() => confirm('Leave the demo? The example data will be erased from this device.') && exitDemo()}>Exit demo</button>
      </div>
    );
  }
  const s = STEPS[step];
  return (
    <div className="tour" role="dialog" aria-label="Guided demo">
      <small>Step {step + 1} of {STEPS.length}</small>
      <b>{s.title}</b>
      <p>{s.text}</p>
      <div className="actions">
        {step > 0 && <button onClick={() => to(step - 1)}>Back</button>}
        <button className="primary" onClick={() => to(step + 1 < STEPS.length ? step + 1 : -1)}>{step + 1 < STEPS.length ? 'Next' : 'Finish'}</button>
        <button className="link" onClick={() => to(-1)}>End tour</button>
      </div>
    </div>
  );
}
