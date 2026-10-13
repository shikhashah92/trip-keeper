import { useStore, useLog } from '../store';
import { useBackup } from '../backupActions';
import { backupDue, fmtLong, dayKey, summary } from '../model';
import { confirm, notify } from '../io';
import { goBack } from '../components';
import { Banner, Button, Card, Gap, Header, IconButton, Screen, T } from '../ui';
import { space } from '../theme';

export default function Backup() {
  const { log } = useLog();
  const { wipe } = useStore();
  const { exportLocked, exportPlain, exportCSV, restore, verify, modal } = useBackup();
  const last = log.settings.lastBackupAt;

  async function deleteAll() {
    if (!(await confirm('Delete everything?', 'This removes every trip detail, file, the PIN and the undo history from this phone. It cannot be undone. Save a backup first if you might want it back.', 'Delete everything', true))) return;
    try { await wipe(); } catch (e) { notify('Could not delete', (e as Error).message); }
  }
  return (
    <Screen>
      <Header title="Backup and restore" left={<IconButton icon="chevron-back" label="Back" onPress={() => goBack()} />} />
      <T v="small">Everything lives only on this phone. Save a backup file now and then, and keep it in Drive, iCloud or email. Trip Keeper never uploads anything: the file goes where you send it.</T>
      <Gap />
      {backupDue(log) ? <><Banner text="It has been a week since your last backup." /><Gap /></> : null}
      <Card>
        <T v="label">Your trip</T>
        <T>“{log.trip.name}”: {summary(log)}, {log.attachments.length} attached {log.attachments.length === 1 ? 'file' : 'files'}.</T>
        <T v="small">{last ? `Last backup: ${fmtLong(dayKey(new Date(last)))}.` : 'Not backed up yet.'}</T>
      </Card>
      <Gap />
      <Button title="Save a locked backup" icon="lock-closed-outline" onPress={exportLocked} />
      <Gap h={space.sm} />
      <T v="small">Locked with a passphrase on your phone: safe to keep anywhere. If you forget the passphrase it cannot be recovered.</T>
      <Gap />
      <Button title="Save a backup" icon="download-outline" kind="secondary" onPress={exportPlain} />
      <Gap h={space.sm} />
      <Button title="Restore from a file" icon="folder-open-outline" kind="secondary" onPress={restore} />
      <Gap h={space.sm} />
      <Button title="Check a backup file" icon="shield-checkmark-outline" kind="secondary" onPress={verify} />
      <Gap h={space.sm} />
      <Button title="Export expenses (CSV)" icon="document-text-outline" kind="secondary" onPress={exportCSV} />
      <Gap h={32} />
      <Button title="Delete everything" kind="danger" onPress={deleteAll} />
      {modal}
    </Screen>
  );
}
