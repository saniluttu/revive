// Avatar panel text, added to the app's i18n under `avatar.*`. Kept here so the
// avatar is self-contained; the step captions reuse exercises.<id>.steps.

import i18n from '../i18n/index.js'

export const AVATAR_TEXT = {
  en: {
    title: 'Watch and follow',
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    view: 'View',
    front: 'Front',
    side: 'Side',
    mirror: 'Mirror',
    loop: 'Repeat',
    startPosition: 'Start position',
    rep: 'Rep {{count}}',
    loading: 'Loading the demonstration…',
    unavailable: 'The 3D demonstration cannot run on this device. Follow the written steps instead.',
    label: '3D demonstration of {{name}}',
  },
  ml: {
    title: 'കണ്ട് കൂടെ ചെയ്യൂ',
    play: 'പ്ലേ',
    pause: 'നിർത്തുക',
    speed: 'വേഗത',
    view: 'കാഴ്ച',
    front: 'മുന്നിൽ',
    side: 'വശം',
    mirror: 'കണ്ണാടി',
    loop: 'ആവർത്തിക്കുക',
    startPosition: 'തുടക്ക നില',
    rep: '{{count}}-ാം തവണ',
    loading: 'ഡെമോ ലോഡ് ചെയ്യുന്നു…',
    unavailable: 'ഈ ഉപകരണത്തിൽ 3D ഡെമോ പ്രവർത്തിക്കില്ല. എഴുതിയ നിർദ്ദേശങ്ങൾ പിന്തുടരൂ.',
    label: '{{name}} — 3D ഡെമോ',
  },
}

for (const [lng, text] of Object.entries(AVATAR_TEXT)) {
  i18n.addResourceBundle(lng, 'translation', { avatar: text }, true, false)
}
