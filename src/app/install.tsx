import { useInstall, isIOS } from '../pwa';
import { goBack } from '../components';
import { Button, Card, Gap, Header, IconButton, Screen, T } from '../ui';

/** Installing matters: Safari may clear a website's storage after 7 days without a visit, but not a home-screen app's. */
export default function Install() {
  const { canInstall, install } = useInstall();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Add to Home Screen" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="small">Open it once with internet. After that it works fully offline, even in airplane mode.</T>
      <Gap />
      <Card>
        {isIOS()
          ? <T>In Safari, tap Share, then Add to Home Screen.</T>
          : <T>{canInstall ? 'Tap the button below to install.' : 'In your browser’s menu, choose Install app or Add to Home screen.'}</T>}
      </Card>
      {canInstall ? <><Gap /><Button title="Install" icon="download-outline" onPress={install} /></> : null}
    </Screen>
  );
}
