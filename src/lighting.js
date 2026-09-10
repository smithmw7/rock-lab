// Shared by the lighting selector, recipes, and authored world presets.
// Explicit positions restore the original directions after a different mood.
export const LIGHTING_PRESETS = {
  alpine: {
    label: 'Alpine', key: '#ffe5bf', sky: '#c5d7ef', rim: '#789bdc',
    ki: 2.7, ri: 1.9, hi: .85, bg: '#151d25',
    keyPosition: [-4, 7, 5], rimPosition: [4, 3, -4],
  },
  soft: {
    label: 'Soft studio', key: '#fff4e9', sky: '#d7e4ec', rim: '#b6ccd8',
    ki: 2.2, ri: .8, hi: 1.2, bg: '#252c31',
    keyPosition: [-4, 7, 5], rimPosition: [4, 3, -4],
  },
  sunset: {
    label: 'Warm sunset', key: '#ffc781', sky: '#c4bccc', rim: '#92a8e9',
    ki: 3, ri: 1.8, hi: .75, bg: '#241f26',
    keyPosition: [-4, 7, 5], rimPosition: [4, 3, -4],
  },
  daylight: {
    label: 'Clear daylight', key: '#fff1d8', sky: '#bed8f5', rim: '#ddeaff',
    ki: 3.15, ri: 1.15, hi: 1, bg: '#273542',
    keyPosition: [-3, 9, 4], rimPosition: [5, 4, -5],
  },
  goldenHour: {
    label: 'Golden hour', key: '#ffb966', sky: '#c8c5d8', rim: '#ffd8a4',
    ki: 3.1, ri: 1.2, hi: .7, bg: '#302527',
    keyPosition: [-6, 3.4, 4], rimPosition: [3, 4, -5],
  },
  moonlight: {
    label: 'Moonlight', key: '#a9c8ff', sky: '#697fae', rim: '#bdeaff',
    ki: 1.95, ri: 2.6, hi: .52, bg: '#0b1223',
    keyPosition: [-4, 8, 1], rimPosition: [4, 3.5, -5],
  },
  overcast: {
    label: 'Overcast', key: '#e5ecf1', sky: '#d6dfe5', rim: '#cedce3',
    ki: 1.55, ri: .35, hi: 1.5, bg: '#303940',
    keyPosition: [-2, 10, 5], rimPosition: [3, 5, -4],
  },
  dramatic: {
    label: 'Dramatic', key: '#ffe2ba', sky: '#77849b', rim: '#8dbafa',
    ki: 3.35, ri: 2.65, hi: .38, bg: '#10131a',
    keyPosition: [-5, 5.5, 2.3], rimPosition: [3, 3, -5],
  },
};
