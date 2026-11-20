// Static training data: exercise library, session templates, run-walk ladder.
// Pure data — no DOM, importable from Node tests.

/*
 Exercise fields
 n      display name
 k      'reps' | 'hold' (seconds)
 lo/hi  bodyweight target range
 wlo/whi range once loaded with the dip belt (presence = belt-loadable)
 always always loaded with a plate in hand (start = first load in kg)
 step   kg per load increase
 g      muscles worked [primary, ...secondary]
 main   compound lift: longer rest
 knee   knee-dominant (ACL caution)   sh: stresses the front of the shoulder
 next   harder variant once the top of the range is easy
 test   test key used to seed targets; tf = factor applied to that test
 each   reps are per side
*/
export const EX = {
  genwarm: { n: 'General warm-up', k: 'hold', lo: 180, hi: 180, g: [], prep: 1, timer: 1, alt: [],
    cues: ['Easy jog on the spot, jump rope with small low hops, or a brisk walk with arm circles.', 'Raise your pulse until you feel warm, not tired.', 'Finish with 10 arm circles each way and 10 hip circles.'] },
  pullup: { n: 'Pull-up', k: 'reps', lo: 5, hi: 12, wlo: 5, whi: 8, step: 2.5, g: ['back', 'biceps'], main: 1, test: 'pull', alt: ['chinup', 'invrow'],
    cues: ['Grip just outside shoulders. Full dead hang at the bottom, chin over the bar at the top.', 'Start each rep by pulling the shoulders down and back, then drive the elbows to your ribs.', 'Legs together and slightly in front (hollow body). No kipping or swinging.', 'Lower in 3 s. The lowering builds a lot of the muscle.'] },
  chinup: { n: 'Chin-up', k: 'reps', lo: 6, hi: 12, wlo: 5, whi: 8, step: 2.5, g: ['back', 'biceps'], main: 1, test: 'pull', tf: 1.1, alt: ['pullup', 'invrow'],
    cues: ['Palms facing you, shoulder-width grip.', 'Full hang to chest near the bar. Ribs down, legs still.', 'Lower in 2–3 s.'] },
  dip: { n: 'Parallel bar dip', k: 'reps', lo: 6, hi: 15, wlo: 6, whi: 10, step: 2.5, g: ['chest', 'triceps', 'shoulders'], main: 1, sh: 1, test: 'dip', alt: ['pushup'],
    cues: ['Lock out at the top with the shoulders pushed down, away from your ears.', 'Lean slightly forward. Lower until the upper arm is about parallel to the floor, no deeper than the shoulder tolerates.', 'Elbows go back, not out. 2–3 s down, no bounce.', 'Stop the set if the front of the shoulder pinches.'] },
  pushup: { n: 'Push-up', k: 'reps', lo: 10, hi: 25, wlo: 8, whi: 15, step: 5, g: ['chest', 'triceps', 'shoulders'], test: 'push', alt: ['diamond'],
    cues: ['Hands on parallettes or low dip bars for extra depth.', 'Body in one line, glutes and abs tight, elbows about 45° from the body.', 'Once 25 is easy, a plate goes on your upper back.'] },
  invrow: { n: 'Inverted row', k: 'reps', lo: 8, hi: 15, g: ['back', 'biceps'], test: 'row', alt: ['chinup'], next: 'invrowfe',
    cues: ['Under the dip bars, body straight, heels on the floor.', 'Pull the chest to the bar, squeeze the shoulder blades, pause 1 s.', 'The more horizontal the body, the harder it is.'] },
  invrowfe: { n: 'Inverted row, feet up', k: 'reps', lo: 8, hi: 15, wlo: 8, whi: 12, step: 5, g: ['back', 'biceps'], test: 'row', tf: 0.8, alt: ['invrow'],
    cues: ['Feet on a chair so the body is horizontal.', 'Chest to the bar, 1 s squeeze. A plate on the stomach once 15 is easy.'] },
  pike: { n: 'Pike push-up', k: 'reps', lo: 6, hi: 12, g: ['shoulders', 'triceps'], sh: 1, test: 'push', tf: 0.4, alt: ['pushup'], next: 'pikeel',
    cues: ['Hips high, head moves forward of the hands, elbows about 45°.', 'Only as deep as is pain-free for the shoulder.'] },
  pikeel: { n: 'Elevated pike push-up', k: 'reps', lo: 6, hi: 12, g: ['shoulders', 'triceps'], sh: 1, test: 'push', tf: 0.3, alt: ['pike'],
    cues: ['Feet on a chair, hips stacked over the shoulders.', 'Head to the floor in front of the hands, controlled lowering.'] },
  diamond: { n: 'Diamond push-up', k: 'reps', lo: 8, hi: 20, g: ['triceps', 'chest'], test: 'push', tf: 0.6, alt: ['pushup'],
    cues: ['Hands close under the chest, elbows track back along the ribs.', 'Full lockout to finish the triceps.'] },
  platelat: { n: 'Plate lateral raise', k: 'reps', lo: 12, hi: 20, always: 1, start: 2.5, step: 2.5, g: ['shoulders'], alt: [],
    cues: ['A light plate in each hand, gripped at the rim.', 'Raise to shoulder height, slight bend in the elbow, lead with the elbows.', 'Slow, no swinging. This builds shoulder width.'] },
  hkr: { n: 'Hanging knee raise', k: 'reps', lo: 10, hi: 15, g: ['core'], next: 'hlr', alt: ['deadbug'],
    cues: ['Dead hang, shoulders engaged. Curl the pelvis up as the knees come to the chest.', 'No swinging; pause between reps if needed.'] },
  hlr: { n: 'Hanging leg raise', k: 'reps', lo: 6, hi: 12, g: ['core'], alt: ['hkr'],
    cues: ['Legs straight, raise to at least hip height, controlled lowering.'] },
  splitsq: { n: 'Split squat', k: 'reps', lo: 8, hi: 12, always: 1, start: 0, step: 2.5, g: ['quads', 'glutes'], knee: 1, each: 1, alt: ['stepup', 'boxsq'],
    cues: ['Long stance, back knee goes straight down. Plates at your sides (start with bodyweight).', 'Front knee tracks over the second toe, never caving inward.', 'Only as deep as the knee feels stable. Stop at any sharp pain or instability.'] },
  stepup: { n: 'Step-up (low box)', k: 'reps', lo: 8, hi: 12, always: 1, start: 0, step: 2.5, g: ['quads', 'glutes'], knee: 1, each: 1, alt: ['splitsq'],
    cues: ['Box no higher than knee height. Drive through the whole front foot.', 'Step down slowly. Knee stays over the toes.'] },
  boxsq: { n: 'Box squat', k: 'reps', lo: 10, hi: 15, always: 1, start: 0, step: 2.5, g: ['quads', 'glutes'], knee: 1, alt: ['splitsq'],
    cues: ['Plate held at the chest. Sit back to a chair, touch lightly, stand.', 'Knees out over the toes, no twisting.'] },
  slrdl: { n: 'Single-leg RDL', k: 'reps', lo: 8, hi: 12, always: 1, start: 0, step: 2.5, g: ['hams', 'glutes', 'lowback'], each: 1, alt: ['hipthrust'],
    cues: ['Soft knee on the standing leg; hinge at the hip as the free leg goes back.', 'Back flat, plate close to the leg. Stop at the hamstring stretch.', 'Holding a wall for balance is fine.'] },
  hipthrust: { n: 'Hip thrust', k: 'reps', lo: 10, hi: 20, always: 1, start: 5, step: 5, g: ['glutes', 'hams'], alt: ['glutebr'],
    cues: ['Upper back on a bench, plate on the hips over a folded towel.', 'Chin tucked, ribs down. Drive up until the hips are level, squeeze 1 s.'] },
  slcurl: { n: 'Slider leg curl', k: 'reps', lo: 8, hi: 15, g: ['hams'], alt: ['hipthrust'],
    cues: ['On your back, heels on a towel on a smooth floor, hips up.', 'Slide the heels in, then out slowly, hips staying up.', 'Strong hamstrings help stabilise a knee without an ACL.'] },
  calf: { n: 'Single-leg calf raise', k: 'reps', lo: 12, hi: 20, always: 1, start: 0, step: 2.5, g: ['calves'], each: 1, alt: [],
    cues: ['Ball of the foot on a step, full stretch at the bottom, 1 s pause at the top.'] },
  backext: { n: 'Back extension', k: 'reps', lo: 10, hi: 20, always: 1, start: 0, step: 2.5, g: ['lowback', 'glutes'], alt: ['birddog'],
    cues: ['Face down, hands by the ears (a plate at the chest later).', 'Lift chest and legs a few cm, squeeze the glutes, hold 2 s. Do not crank the neck.', 'Builds the back muscles that keep the spine stable under the belt.'] },
  birddog: { n: 'Bird dog', k: 'reps', lo: 8, hi: 12, g: ['core', 'lowback'], each: 1, alt: ['deadbug'],
    cues: ['On hands and knees, reach the opposite arm and leg long without rotating the hips.', 'Hold 3 s at full reach.'] },
  deadbug: { n: 'Dead bug', k: 'reps', lo: 8, hi: 12, g: ['core'], each: 1, alt: ['birddog'],
    cues: ['Lower back pressed into the floor the whole time.', 'Lower the opposite arm and leg slowly, breathe out.'] },
  sideplank: { n: 'Side plank', k: 'hold', lo: 20, hi: 45, g: ['core'], each: 1, alt: ['deadbug'],
    cues: ['Elbow under the shoulder, body in one line, hips high.'] },
  glutebr: { n: 'Glute bridge', k: 'reps', lo: 12, hi: 20, g: ['glutes'], alt: [],
    cues: ['Feet flat, drive through the heels, squeeze at the top for 1 s.'] },
  ytw: { n: 'Prone Y-T-W raises', k: 'reps', lo: 6, hi: 10, g: ['shoulders'], prep: 1, alt: [],
    cues: ['Face down. Raise the arms into a Y, then a T, then a W ("U"); that is one rep.', 'Thumbs up, shoulder blades down and back, hold each position 2 s.', 'Very light plates (1.25–2.5 kg) only once it feels easy.'] },
  passthru: { n: 'Bar pass-throughs', k: 'reps', lo: 10, hi: 15, g: [], prep: 1, alt: [],
    cues: ['Hold a stick or band at the ends, very wide grip.', 'Arms straight, rotate it over the head to behind the back and return. Slow and pain-free.', 'Narrow the grip slowly over the weeks.'] },
  scappull: { n: 'Scapular pull-up', k: 'reps', lo: 8, hi: 12, g: ['back'], prep: 1, alt: [],
    cues: ['Hang with straight arms. Pull the shoulder blades down without bending the elbows, then relax.'] },
  scappush: { n: 'Scapular push-up', k: 'reps', lo: 10, hi: 15, g: ['shoulders'], prep: 1, alt: [],
    cues: ['Push-up position, arms straight. Let the chest sink between the shoulder blades, then push the floor away.'] }
};

export const GROUPS = { back: 'Back', chest: 'Chest', shoulders: 'Shoulders', triceps: 'Triceps', biceps: 'Biceps', quads: 'Quads', glutes: 'Glutes', hams: 'Hamstrings', calves: 'Calves', core: 'Core', lowback: 'Lower back' };
// Weekly hard-set ranges where most growth happens (secondary muscles count half).
export const VOL_TARGET = { back: [10, 16], chest: [10, 16], shoulders: [8, 14], quads: [6, 12], glutes: [6, 12], hams: [6, 12], triceps: [6, 12], biceps: [6, 12] };

export const TPL = {
  A: { name: 'Upper 1 · Pull focus', short: 'Upper 1', kind: 'str',
    prep: [['genwarm', 1], ['ytw', 2], ['passthru', 2], ['scappull', 2]],
    main: [['pullup', 4], ['dip', 3], ['invrow', 3], ['pushup', 3], ['hkr', 3]], fin: true,
    why: 'Weighted pull-ups lead. Back and biceps get the most volume; dips and push-ups keep chest and triceps working.' },
  B: { name: 'Lower + Back', short: 'Lower', kind: 'str',
    prep: [['genwarm', 1], ['glutebr', 2], ['birddog', 1]],
    main: [['splitsq', 3], ['slrdl', 3], ['hipthrust', 3], ['slcurl', 3], ['calf', 2], ['backext', 3], ['sideplank', 2]], fin: false,
    why: 'Knee-friendly legs: hip-dominant work and hamstrings first (they protect a knee without an ACL), controlled split squats, no jumping or pivoting. Ends with the back strength the belt needs.' },
  C: { name: 'Upper 2 · Push focus', short: 'Upper 2', kind: 'str',
    prep: [['genwarm', 1], ['ytw', 2], ['passthru', 2], ['scappush', 2]],
    main: [['dip', 4], ['chinup', 3], ['pike', 3], ['invrow', 3], ['platelat', 3], ['diamond', 2], ['hkr', 2]], fin: true,
    why: 'Weighted dips lead. Shoulder width from pike push-ups and lateral raises; chin-ups keep the back at two sessions a week.' },
  D: { name: 'Run-walk + Back care', short: 'Run', kind: 'run',
    prep: [['passthru', 1], ['ytw', 1]],
    main: [['backext', 2], ['deadbug', 2], ['birddog', 2], ['sideplank', 2]], fin: false, run: true,
    why: 'Main running session: build to 30 minutes of continuous easy running, then add time. Finish with spine and core work.' },
  T: { name: 'Test day', short: 'Test', kind: 'test',
    prep: [['genwarm', 1], ['passthru', 1], ['ytw', 1], ['scappull', 1]],
    tests: [['pullup', 'pull'], ['dip', 'dip'], ['pushup', 'push'], ['invrow', 'row']],
    why: 'Find your current numbers so the return ramp starts from where you are now, not from 6 months ago.' }
};
export const PROGRAM_TPLS = ['A', 'B', 'C', 'D'];

export const TESTS = [
  ['pull', 'Pull-ups', 'Strict, full hang to chin over the bar. Stop at the first rep with bad form.'],
  ['dip', 'Dips', 'Upper arm to parallel, full lockout.'],
  ['push', 'Push-ups', 'Chest to fist height, body straight.'],
  ['row', 'Inverted rows', 'Under the dip bars, heels on the floor.']
];

// Run-walk ladder: r = run s, w = walk s, n = repeats; c = continuous minutes.
export const RUN = [
  { r: 60, w: 90, n: 8 }, { r: 90, w: 90, n: 7 }, { r: 120, w: 60, n: 7 }, { r: 180, w: 60, n: 6 }, { r: 240, w: 60, n: 5 }, { r: 300, w: 60, n: 4 },
  { r: 420, w: 60, n: 3 }, { r: 600, w: 60, n: 3 }, { c: 15 }, { c: 20 }, { c: 25 }, { c: 30 }, { c: 35 }, { c: 40 }, { c: 45 }
];

export const RUN_ALTS = { run: 'Run-walk', walk: 'Brisk walk', free: 'Free run', test: 'Run test' };

export function demoUrl(x) {
  const e = EX[x];
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${e ? e.n : x} proper form calisthenics`);
}
