import { db, uid, type Person } from './db';
import { addExpense, approveExpense, closeBudget, createBudget } from './actions';

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

/** Fills the app with a realistic church example for demos. */
export async function loadSampleData(me: Person) {
  const ruth: Person = { id: uid(), name: 'Ruth Mensah', role: 'missionary' };
  const daniel: Person = { id: uid(), name: 'Daniel Okafor', role: 'leader' };
  const youthTeam: Person = { id: uid(), name: 'Youth team', role: 'volunteer' };
  await db.people.bulkAdd([ruth, daniel, youthTeam]);

  const kenya = await createBudget({ name: 'Kenya mission trip', purpose: 'Travel, lodging and outreach supplies', assigneeId: ruth.id, assigneeName: ruth.name, amount: 400000, startDate: daysFromNow(-20), endDate: daysFromNow(10) }, me);
  await addExpense({ budgetId: kenya.id, date: daysFromNow(-18), merchant: 'Kenya Airways', category: 'Travel', amount: 168500, notes: 'Round trip', paidWith: 'budget', spenderId: ruth.id, spenderName: ruth.name, source: 'email' }, me, true);
  await addExpense({ budgetId: kenya.id, date: daysFromNow(-12), merchant: 'Nairobi Guest House', category: 'Lodging', amount: 96000, notes: '8 nights', paidWith: 'budget', spenderId: ruth.id, spenderName: ruth.name, source: 'camera' }, me, true);
  await addExpense({ budgetId: kenya.id, date: daysFromNow(-3), merchant: 'Bible Society of Kenya', category: 'Ministry supplies', amount: 42500, notes: 'Bibles for the school visit', paidWith: 'own', spenderId: ruth.id, spenderName: ruth.name, source: 'camera' }, ruth, false);

  const youth = await createBudget({ name: 'Youth retreat', purpose: 'Food and activities for the fall retreat', assigneeId: youthTeam.id, assigneeName: youthTeam.name, amount: 120000, startDate: daysFromNow(-25), endDate: daysFromNow(3) }, me);
  const pizza = await addExpense({ budgetId: youth.id, date: daysFromNow(-5), merchant: 'Costco', category: 'Food', amount: 61240, notes: '', paidWith: 'own', spenderId: youthTeam.id, spenderName: youthTeam.name, source: 'camera' }, youthTeam, false);
  await approveExpense(pizza, me);
  await addExpense({ budgetId: youth.id, date: daysFromNow(-2), merchant: 'Lakeside Camp', category: 'Venue', amount: 45000, notes: 'Deposit', paidWith: 'budget', spenderId: youthTeam.id, spenderName: youthTeam.name, source: 'gallery' }, me, true);

  const vbs = await createBudget({ name: 'Vacation Bible School', purpose: 'Crafts and snacks', assigneeId: daniel.id, assigneeName: daniel.name, amount: 80000, startDate: daysFromNow(-60), endDate: daysFromNow(-30) }, me);
  await addExpense({ budgetId: vbs.id, date: daysFromNow(-45), merchant: 'Hobby Lobby', category: 'Supplies', amount: 51800, notes: '', paidWith: 'budget', spenderId: daniel.id, spenderName: daniel.name, source: 'camera' }, me, true);
  await closeBudget({ ...vbs }, me, null);
}
