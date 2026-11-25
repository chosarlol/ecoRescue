/* =========================================================================
   EcoRescue Cambodia - ui.js
   =========================================================================
   Everything the player reads or hears:
     - the EN / KM string tables and t()
     - HUD (phase clock, objectives, prompts, progress bars)
     - the mini-map
     - info panels, the result screen and the "Why?" explanation
     - the About / Roadmap modal
     - WebAudio sound effects, generated in code so there are no audio files

   Game rules live in main.js. This file only presents state.
   ========================================================================= */

(function (global) {
  'use strict';

  /* =======================================================================
     STRINGS
     -----------------------------------------------------------------------
     NOTE FOR THE TEAM: the Khmer block was machine-written and has NOT been
     checked by a Khmer speaker. Please have one review it before a public
     demo. English is authoritative.
     ======================================================================= */
  const I18N = {
    en: {
      appTitle: 'EcoRescue Cambodia',
      themeBadge: 'OpenData X AI · Environment & Natural Resources',
      titleSub: 'You lead a forest protection team in Kratie. Satellites picked up heat near a ' +
        'village. Walk the forest, read the open data, and decide what to protect first.',
      start: 'Start',
      aboutData: 'About the data',
      chooseCharacter: 'Choose your character',
      chooseSub: 'Each one changes how you play. You can switch after the mission.',
      beginMission: 'Begin Mission',

      charRanger: 'Ranger',
      charRangerDesc: 'Moves fastest. Covers ground quickly, so distant signals stay reachable.',
      charScout: 'Data Scout',
      charScoutDesc: 'Spots heat points from twice as far, and info panels show the rainfall trend.',
      charLiaison: 'Village Liaison',
      charLiaisonDesc: 'Prepares the village in under half the time. Buys you minutes on the clock.',

      phase: 'Phase',
      controlsHint: 'WASD or arrow keys to walk · E to interact',
      interact: 'Interact',

      objInspect: 'Inspect the priority heat point',
      objPrepare: 'Prepare the village',
      objSurvive: 'Do it before the fire reaches the village',

      promptInspect: 'Inspect heat point {id}',
      promptPrepare: 'Prepare the village',
      promptInspected: 'Already inspected',
      promptPrepared: 'Village is prepared',
      doingInspect: 'Inspecting heat point {id}…',
      doingPrepare: 'Preparing the village…',

      infoHeatPoint: 'Heat point {id}',
      infoVillage: 'Village',
      timeDetected: 'Time detected',
      detectionAge: 'Detection age',
      distToVillage: 'Distance to village',
      distToYou: 'Distance from you',
      rain7: 'Rain, 7 days before',
      rain30: 'Rain, 30 days before',
      maxTemp: 'Max air temperature',
      humidityL: 'Relative humidity',
      landClass: 'Land (derived)',
      forestEdgeYes: 'On or beside the forest edge',
      heatOutput: 'Heat output (FRP)',
      brightness: 'Brightness temperature',
      sensorL: 'Sensor',
      confidenceL: 'Confidence',
      provinceL: 'Province',
      coords: 'Coordinates',
      dataSource: 'Data source',
      rainTrend: 'Rainfall trend, last 14 days',
      scoutBonus: 'Data Scout detail',
      statusL: 'Status',
      prepared: 'Prepared',
      notPrepared: 'Not prepared',
      howPlaced: 'How this was placed',
      detectionsAllTime: 'Detections here, 2000-2025',

      sampleData: 'Sample data',
      derived: 'Derived',
      realData: 'Real data',
      decorative: 'Decorative',

      missionComplete: 'Mission Complete!',
      missionFailed: 'Mission incomplete',
      completeSub: 'You read the data, checked the signal that mattered, and got the village ready in time.',
      failedSub: 'Here is what was still outstanding when the mission ended.',

      checkPriority: 'Inspect the priority heat point',
      checkPriorityDone: 'You inspected {p}, which the risk estimate ranked highest.',
      checkPriorityMiss: 'The risk estimate ranked {p} highest, and it was never inspected.',
      checkVillage: 'Prepare the village',
      checkVillageDone: 'The village was prepared.',
      checkVillageMiss: 'The village was never prepared.',
      checkFire: 'Stay ahead of the fire',
      checkFireOk: 'The village was ready before the fire arrived.',
      checkFireBad: 'The fire reached the village first.',
      checkTime: 'Finish within 3 phases',
      checkTimeOk: 'Finished with {s}s to spare.',
      checkTimeBad: 'Time ran out.',

      whyButton: 'Why? Show the risk estimate',
      playAgain: 'Play again',
      changeCharacter: 'Change character',
      roadmap: 'Roadmap',

      whyIntro: 'You decided first. Now here is the risk estimate and the data behind it. ' +
        'This is a transparent rule-based score, not a trained AI model — every point ' +
        'below traces to a value in the open data.',
      priorityTag: 'Priority',
      outOf: '/ 100',
      unknownF: 'no data',
      rainChartTitle: 'Daily rainfall at the scenario point',
      rainChartSub: 'NASA POWER, {from} to {to}. Markers show when each heat point was detected.',
      methodLabel: 'Method',
      fireExplainTitle: 'How fast the fire spread, and why',
      fireExplainIntro: 'Spread speed was scaled by a dryness value computed from the real ' +
        'weather at the ignition point:',
      fireTimeNote: 'Time is compressed: the mission runs 90 seconds, while a real fire would ' +
        'need hours to cover this ground. The relative effect of rainfall is real; the ' +
        'absolute speed is a game constant.',

      modalAbout: 'About the data',
      modalRoadmap: 'Roadmap',
      scenarioArea: 'Scenario area',
      howPointsPicked: 'How the two heat points were picked',
      dataQuality: 'Data filtering applied',
      langNote: 'Khmer translation is a first draft and needs review by a Khmer speaker.',
      decorRoadNote: 'The road drawn across the map is decorative. It is not from any dataset. ' +
        'It slows fire slightly so the terrain reads as a landscape, and it carries no data claim.',
      timeCompressNote: 'Time is compressed. One phase of 30 seconds stands for several hours.',

      village: 'Village',
      you: 'You',
      fireL: 'Fire',
      heatPointL: 'Heat point',

      tileF: 'Intact forest (rarely burned in 25 years)',
      tilef: 'Forest, some burn history',
      tileE: 'Forest edge (rarely burned, next to cleared land)',
      tileC: 'Cleared / repeatedly burned land',
      tileDot: 'No detections on record',

      fireNear: 'Fire {km} km away',
      villageBurning: 'The fire has reached the village!'
    },

    km: {
      appTitle: '\u17a2\u17c1\u1780\u17bc\u179a\u17c9\u17c1\u179f\u1783\u17d2\u1799\u17bc \u1780\u1798\u17d2\u1796\u17bb\u1787\u17b6',
      themeBadge: 'OpenData X AI \u00b7 \u1794\u179a\u17b7\u179f\u17d2\u1790\u17b6\u1793 \u1793\u17b7\u1784\u1792\u1793\u1792\u17b6\u1793\u1792\u1798\u17d2\u1798\u1787\u17b6\u178f\u17b7',
      titleSub: '\u17a2\u17d2\u1793\u1780\u178a\u17b9\u1780\u1793\u17b6\u17c6\u1780\u17d2\u179a\u17bb\u1798\u1780\u17b6\u179a\u1796\u17b6\u179a\u1796\u17d2\u179a\u17c3\u1793\u17c5\u1781\u17c1\u178f\u17d2\u178f\u1780\u17d2\u179a\u1785\u17c1\u17c7\u17d4 \u1795\u17d2\u1780\u17b6\u1799\u179a\u178e\u1794\u1794\u17b6\u1793\u179a\u1780\u1783\u17be\u1789\u1780\u17c6\u178a\u17c5\u1793\u17c5\u1787\u17b7\u178f\u1797\u17bc\u1798\u17b7\u1798\u17bd\u1799\u17d4 \u178a\u17be\u179a\u1780\u17d2\u1793\u17bb\u1784\u1796\u17d2\u179a\u17c3 \u17a2\u17b6\u1793\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1794\u17be\u1780\u1785\u17c6\u17a0 \u179a\u17bd\u1785\u179f\u1798\u17d2\u179a\u17c1\u1785\u1790\u17b6\u178f\u17d2\u179a\u17bc\u179c\u1780\u17b6\u179a\u1796\u17b6\u179a\u17a2\u17d2\u179c\u17b8\u1798\u17bb\u1793\u17d4',
      start: '\u1785\u17b6\u1794\u17cb\u1795\u17d2\u178f\u17be\u1798',
      aboutData: '\u17a2\u17c6\u1796\u17b8\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      chooseCharacter: '\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u178f\u17bd\u17a2\u1784\u17d2\u1782\u179a\u1794\u179f\u17cb\u17a2\u17d2\u1793\u1780',
      chooseSub: '\u178f\u17bd\u17a2\u1784\u17d2\u1782\u1793\u17b8\u1798\u17bd\u1799\u17d7\u1795\u17d2\u179b\u17b6\u179f\u17cb\u1794\u17d2\u178f\u17bc\u179a\u179a\u1794\u17c0\u1794\u179b\u17c1\u1784\u17d4 \u17a2\u17d2\u1793\u1780\u17a2\u17b6\u1785\u1794\u17d2\u178f\u17bc\u179a\u1780\u17d2\u179a\u17c4\u1799\u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798\u17d4',
      beginMission: '\u1785\u17b6\u1794\u17cb\u1795\u17d2\u178f\u17be\u1798\u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798',
      charRanger: '\u17a2\u17d2\u1793\u1780\u179b\u17d2\u1794\u17b6\u178f\u1796\u17d2\u179a\u17c3',
      charRangerDesc: '\u178a\u17be\u179a\u179b\u17bf\u1793\u1794\u17c6\u1795\u17bb\u178f\u17d4 \u1791\u17c5\u178a\u179b\u17cb\u179f\u1789\u17d2\u1789\u17b6\u1786\u17d2\u1784\u17b6\u1799\u1794\u17b6\u1793\u1791\u17b6\u1793\u17cb\u1796\u17c1\u179b\u17d4',
      charScout: '\u17a2\u17d2\u1793\u1780\u179f\u17d2\u179a\u17b6\u179c\u1787\u17d2\u179a\u17b6\u179c\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      charScoutDesc: '\u1798\u17be\u179b\u1783\u17be\u1789\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5\u1786\u17d2\u1784\u17b6\u1799\u1791\u17d2\u179c\u17c1\u178a\u1784 \u17a0\u17be\u1799\u1795\u17d2\u1791\u17b6\u17c6\u1784\u1796\u17d0\u178f\u17cc\u1798\u17b6\u1793\u1794\u1784\u17d2\u17a0\u17b6\u1789\u1793\u17b7\u1793\u17d2\u1793\u17b6\u1780\u17b6\u179a\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784\u17d4',
      charLiaison: '\u17a2\u17d2\u1793\u1780\u179f\u1798\u17d2\u179a\u1794\u179f\u1798\u17d2\u179a\u17bd\u179b\u1797\u17bc\u1798\u17b7',
      charLiaisonDesc: '\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7\u1794\u17b6\u1793\u179b\u17bf\u1793\u1787\u17b6\u1784\u1796\u17b6\u1780\u17cb\u1780\u178e\u17d2\u178f\u17b6\u179b\u17d4 \u179f\u1793\u17d2\u179f\u17c6\u1796\u17c1\u179b\u179c\u17c1\u179b\u17b6\u1794\u17b6\u1793\u17d4',
      phase: '\u178a\u17c6\u178e\u17b6\u1780\u17cb\u1780\u17b6\u179b',
      controlsHint: '\u1794\u17d2\u179a\u17be WASD \u17ac\u1796\u17d2\u179a\u17bd\u1789\u178a\u17be\u1798\u17d2\u1794\u17b8\u178a\u17be\u179a \u00b7 \u1785\u17bb\u1785 E \u178a\u17be\u1798\u17d2\u1794\u17b8\u1792\u17d2\u179c\u17be\u179f\u1780\u1798\u17d2\u1798\u1797\u17b6\u1796',
      interact: '\u1792\u17d2\u179c\u17be\u179f\u1780\u1798\u17d2\u1798\u1797\u17b6\u1796',
      objInspect: '\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5\u17a2\u17b6\u1791\u17b7\u1797\u17b6\u1796',
      objPrepare: '\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7',
      objSurvive: '\u1792\u17d2\u179c\u17be\u17b1\u17d2\u1799\u179a\u17bd\u1785\u1798\u17bb\u1793\u1797\u17d2\u179b\u17be\u1784\u1798\u1780\u178a\u179b\u17cb\u1797\u17bc\u1798\u17b7',
      promptInspect: '\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5 {id}',
      promptPrepare: '\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7',
      promptInspected: '\u1794\u17b6\u1793\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u179a\u17bd\u1785\u17a0\u17be\u1799',
      promptPrepared: '\u1797\u17bc\u1798\u17b7\u1794\u17b6\u1793\u179a\u17c0\u1794\u1785\u17c6\u179a\u17bd\u1785\u17a0\u17be\u1799',
      doingInspect: '\u1780\u17c6\u1796\u17bb\u1784\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5 {id}\u2026',
      doingPrepare: '\u1780\u17c6\u1796\u17bb\u1784\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7\u2026',
      infoHeatPoint: '\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5 {id}',
      infoVillage: '\u1797\u17bc\u1798\u17b7',
      timeDetected: '\u1796\u17c1\u179b\u179c\u17c1\u179b\u17b6\u179a\u1780\u1783\u17be\u1789',
      detectionAge: '\u179a\u1799\u17c8\u1796\u17c1\u179b\u1794\u1793\u17d2\u1791\u17b6\u1794\u17cb\u1796\u17b8\u179a\u1780\u1783\u17be\u1789',
      distToVillage: '\u1785\u1798\u17d2\u1784\u17b6\u1799\u1791\u17c5\u1797\u17bc\u1798\u17b7',
      distToYou: '\u1785\u1798\u17d2\u1784\u17b6\u1799\u1796\u17b8\u17a2\u17d2\u1793\u1780',
      rain7: '\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784 \u17e7 \u1790\u17d2\u1784\u17c3\u1798\u17bb\u1793',
      rain30: '\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784 \u17e3\u17e0 \u1790\u17d2\u1784\u17c3\u1798\u17bb\u1793',
      maxTemp: '\u179f\u17b8\u178f\u17bb\u178e\u17d2\u17a0\u1797\u17b6\u1796\u17a2\u17b6\u1780\u17b6\u179f\u17a2\u178f\u17b7\u1794\u179a\u1798\u17b6',
      humidityL: '\u179f\u17c6\u178e\u17be\u1798\u1792\u17c0\u1794',
      landClass: '\u1794\u17d2\u179a\u1797\u17c1\u1791\u178a\u17b8 (\u1794\u1793\u17d2\u1791\u17b6\u1794\u17cb)',
      forestEdgeYes: '\u1793\u17c5\u1798\u17b6\u178f\u17cb\u1796\u17d2\u179a\u17c3 \u17ac\u1787\u17b7\u178f\u1798\u17b6\u178f\u17cb\u1796\u17d2\u179a\u17c3',
      heatOutput: '\u1780\u1798\u17d2\u179a\u17b7\u178f\u1780\u17c6\u178a\u17c5 (FRP)',
      brightness: '\u179f\u17b8\u178f\u17bb\u178e\u17d2\u17a0\u1797\u17b6\u1796\u1785\u17c6\u17a1\u17b7\u1793',
      sensorL: '\u17a7\u1794\u1780\u179a\u178e\u17cd\u1785\u17b6\u1794\u17cb\u179f\u1789\u17d2\u1789\u17b6',
      confidenceL: '\u1780\u1798\u17d2\u179a\u17b7\u178f\u1787\u17bf\u1787\u17b6\u1780\u17cb',
      provinceL: '\u1781\u17c1\u178f\u17d2\u178f',
      coords: '\u1796\u17b7\u1780\u17b6\u1793\u17d0\u178f',
      dataSource: '\u1794\u17d2\u179a\u1797\u1796\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      rainTrend: '\u1793\u17b7\u1793\u17d2\u1793\u17b6\u1780\u17b6\u179a\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784 \u17e1\u17e4 \u1790\u17d2\u1784\u17c3\u1785\u17bb\u1784\u1780\u17d2\u179a\u17c4\u1799',
      scoutBonus: '\u1796\u17d0\u178f\u17cc\u1798\u17b6\u1793\u1794\u1793\u17d2\u1790\u17c2\u1798',
      statusL: '\u179f\u17d2\u1790\u17b6\u1793\u1797\u17b6\u1796',
      prepared: '\u1794\u17b6\u1793\u179a\u17c0\u1794\u1785\u17c6\u179a\u17bd\u1785',
      notPrepared: '\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb\u179a\u17c0\u1794\u1785\u17c6',
      howPlaced: '\u179a\u1794\u17c0\u1794\u178a\u17b6\u1780\u17cb\u1791\u17b8\u178f\u17b6\u17c6\u1784',
      detectionsAllTime: '\u1780\u17b6\u179a\u179a\u1780\u1783\u17be\u1789\u1793\u17c5\u1791\u17b8\u1793\u17c1\u17c7 \u17e2\u17e0\u17e0\u17e0-\u17e2\u17e0\u17e2\u17e5',
      sampleData: '\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1782\u17c6\u179a\u17bc',
      derived: '\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1794\u1793\u17d2\u1791\u17b6\u1794\u17cb',
      realData: '\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1796\u17b7\u178f',
      decorative: '\u178f\u17bb\u1794\u178f\u17c2\u1784',
      missionComplete: '\u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798\u1794\u17b6\u1793\u1794\u1789\u17d2\u1785\u1794\u17cb!',
      missionFailed: '\u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798\u1798\u17b7\u1793\u1796\u17c1\u1789\u179b\u17c1\u1789',
      completeSub: '\u17a2\u17d2\u1793\u1780\u1794\u17b6\u1793\u17a2\u17b6\u1793\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799 \u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u179f\u1789\u17d2\u1789\u17b6\u179f\u17c6\u1781\u17b6\u1793\u17cb \u17a0\u17be\u1799\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7\u1794\u17b6\u1793\u1791\u17b6\u1793\u17cb\u1796\u17c1\u179b\u17d4',
      failedSub: '\u1793\u17c1\u17c7\u1787\u17b6\u1780\u17b7\u1785\u17d2\u1785\u1780\u17b6\u179a\u178a\u17c2\u179b\u1793\u17c5\u179f\u179b\u17cb\u1796\u17c1\u179b\u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798\u1794\u1789\u17d2\u1785\u1794\u17cb\u17d4',
      checkPriority: '\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5\u17a2\u17b6\u1791\u17b7\u1797\u17b6\u1796',
      checkPriorityDone: '\u17a2\u17d2\u1793\u1780\u1794\u17b6\u1793\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799 {p} \u178a\u17c2\u179b\u1780\u17b6\u179a\u1794\u17c9\u17b6\u1793\u17cb\u1794\u17d2\u179a\u1798\u17b6\u178e\u1785\u17b6\u178f\u17cb\u1790\u17d2\u1793\u17b6\u1780\u17cb\u1781\u17d2\u1796\u179f\u17cb\u1794\u17c6\u1795\u17bb\u178f\u17d4',
      checkPriorityMiss: '\u1780\u17b6\u179a\u1794\u17c9\u17b6\u1793\u17cb\u1794\u17d2\u179a\u1798\u17b6\u178e\u1785\u17b6\u178f\u17cb\u1790\u17d2\u1793\u17b6\u1780\u17cb {p} \u1781\u17d2\u1796\u179f\u17cb\u1794\u17c6\u1795\u17bb\u178f \u1794\u17c9\u17bb\u1793\u17d2\u178f\u17c2\u1798\u17b7\u1793\u1794\u17b6\u1793\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u17d4',
      checkVillage: '\u179a\u17c0\u1794\u1785\u17c6\u1797\u17bc\u1798\u17b7',
      checkVillageDone: '\u1797\u17bc\u1798\u17b7\u1794\u17b6\u1793\u179a\u17c0\u1794\u1785\u17c6\u17d4',
      checkVillageMiss: '\u1797\u17bc\u1798\u17b7\u1798\u17b7\u1793\u1794\u17b6\u1793\u179a\u17c0\u1794\u1785\u17c6\u17d4',
      checkFire: '\u1793\u17b6\u17c6\u1798\u17bb\u1781\u1797\u17d2\u179b\u17be\u1784',
      checkFireOk: '\u1797\u17bc\u1798\u17b7\u1794\u17b6\u1793\u179a\u17c0\u1794\u1785\u17c6\u1798\u17bb\u1793\u1797\u17d2\u179b\u17be\u1784\u1798\u1780\u178a\u179b\u17cb\u17d4',
      checkFireBad: '\u1797\u17d2\u179b\u17be\u1784\u1798\u1780\u178a\u179b\u17cb\u1797\u17bc\u1798\u17b7\u1798\u17bb\u1793\u17d4',
      checkTime: '\u1794\u1789\u17d2\u1785\u1794\u17cb\u1780\u17d2\u1793\u17bb\u1784 \u17e3 \u178a\u17c6\u178e\u17b6\u1780\u17cb\u1780\u17b6\u179b',
      checkTimeOk: '\u1794\u1789\u17d2\u1785\u1794\u17cb\u178a\u17c4\u1799\u1793\u17c5\u179f\u179b\u17cb {s} \u179c\u17b7\u1793\u17b6\u1791\u17b8\u17d4',
      checkTimeBad: '\u17a2\u179f\u17cb\u1796\u17c1\u179b\u17a0\u17be\u1799\u17d4',
      whyButton: '\u1798\u17bc\u179b\u17a0\u17c1\u178f\u17bb\u17a2\u17d2\u179c\u17b8? \u1794\u1784\u17d2\u17a0\u17b6\u1789\u1780\u17b6\u179a\u1794\u17c9\u17b6\u1793\u17cb\u1794\u17d2\u179a\u1798\u17b6\u178e\u17a0\u17b6\u1793\u17b7\u1797\u17d0\u1799',
      playAgain: '\u179b\u17c1\u1784\u1798\u17d2\u178f\u1784\u1791\u17c0\u178f',
      changeCharacter: '\u1794\u17d2\u178f\u17bc\u179a\u178f\u17bd\u17a2\u1784\u17d2\u1782',
      roadmap: '\u1795\u17c2\u1793\u1780\u17b6\u179a\u17a2\u1793\u17b6\u1782\u178f',
      whyIntro: '\u17a2\u17d2\u1793\u1780\u1794\u17b6\u1793\u179f\u1798\u17d2\u179a\u17c1\u1785\u1798\u17bb\u1793\u17d4 \u17a5\u17a1\u17bc\u179c\u1793\u17c1\u17c7\u1787\u17b6\u1780\u17b6\u179a\u1794\u17c9\u17b6\u1793\u17cb\u1794\u17d2\u179a\u1798\u17b6\u178e\u17a0\u17b6\u1793\u17b7\u1797\u17d0\u1799 \u1793\u17b7\u1784\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u1796\u17b8\u1780\u17d2\u179a\u17c4\u1799\u17d4 \u1793\u17c1\u17c7\u1787\u17b6\u1796\u17b7\u1793\u17d2\u1791\u17bb\u1794\u17d2\u179a\u1798\u17b6\u178e\u178f\u17b6\u1798\u1780\u17d2\u1794\u17bd\u1793\u1781\u17d2\u178e\u17d2\u178c\u17a2\u17b6\u1785\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u1794\u17b6\u1793 \u1798\u17b7\u1793\u1798\u17c2\u1793\u1782\u17c6\u179a\u17bc AI \u178a\u17c2\u179b\u1794\u17b6\u1793\u17a0\u17b6\u178f\u17cb\u1794\u1784\u17d2\u179a\u17c0\u1793\u1791\u17c1\u17d4',
      priorityTag: '\u17a2\u17b6\u1791\u17b7\u1797\u17b6\u1796',
      outOf: '/ 100',
      unknownF: '\u1782\u17d2\u1798\u17b6\u1793\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      rainChartTitle: '\u1794\u179a\u17b7\u1798\u17b6\u178e\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784\u1794\u17d2\u179a\u1785\u17b6\u17c6\u1790\u17d2\u1784\u17c3',
      rainChartSub: 'NASA POWER, {from} \u178a\u179b\u17cb {to}\u17d4',
      methodLabel: '\u179c\u17b7\u1792\u17b8\u179f\u17b6\u179f\u17d2\u178f\u17d2\u179a',
      fireExplainTitle: '\u1797\u17d2\u179b\u17be\u1784\u179a\u17b6\u179b\u178a\u17b6\u179b\u179b\u17bf\u1793\u1794\u17c9\u17bb\u178e\u17d2\u178e\u17b6 \u1793\u17b7\u1784\u17a0\u17c1\u178f\u17bb\u17a2\u17d2\u179c\u17b8',
      fireExplainIntro: '\u179b\u17d2\u1794\u17bf\u1793\u179a\u17b6\u179b\u178a\u17b6\u179b\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1780\u17c6\u178e\u178f\u17cb\u178a\u17c4\u1799\u178f\u1798\u17d2\u179b\u17c3\u1797\u17b6\u1796\u179f\u17d2\u1784\u17bd\u178f \u178a\u17c2\u179b\u1782\u178e\u1793\u17b6\u1796\u17b8\u17a2\u17b6\u1780\u17b6\u179f\u1792\u17b6\u178f\u17bb\u1796\u17b7\u178f\u17d6',
      fireTimeNote: '\u1796\u17c1\u179b\u179c\u17c1\u179b\u17b6\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1794\u1784\u17d2\u179a\u17bd\u1798\u17d6 \u1794\u17c1\u179f\u1780\u1780\u1798\u17d2\u1798\u1798\u17b6\u1793 \u17e9\u17e0 \u179c\u17b7\u1793\u17b6\u1791\u17b8 \u1794\u17c9\u17bb\u1793\u17d2\u178f\u17c2\u1797\u17d2\u179b\u17be\u1784\u1796\u17b7\u178f\u178f\u17d2\u179a\u17bc\u179c\u1780\u17b6\u179a\u1785\u17d2\u179a\u17be\u1793\u1798\u17c9\u17c4\u1784\u17d4 \u17a5\u1791\u17d2\u1792\u17b7\u1796\u179b\u1792\u17c0\u1794\u1793\u17c3\u1791\u17b9\u1780\u1797\u17d2\u179b\u17c0\u1784\u1782\u17ba\u1796\u17b7\u178f \u1794\u17c9\u17bb\u1793\u17d2\u178f\u17c2\u179b\u17d2\u1794\u17bf\u1793\u1796\u17b7\u178f\u1794\u17d2\u179a\u17b6\u1780\u178a\u1787\u17b6\u178f\u1798\u17d2\u179b\u17c3\u1780\u17c6\u178e\u178f\u17cb\u1780\u17d2\u1793\u17bb\u1784\u17a0\u17d2\u1782\u17c1\u1798\u17d4',
      modalAbout: '\u17a2\u17c6\u1796\u17b8\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      modalRoadmap: '\u1795\u17c2\u1793\u1780\u17b6\u179a\u17a2\u1793\u17b6\u1782\u178f',
      scenarioArea: '\u178f\u17c6\u1794\u1793\u17cb\u179f\u17b6\u1780\u179b\u17d2\u1794\u1784',
      howPointsPicked: '\u179a\u1794\u17c0\u1794\u1787\u17d2\u179a\u17be\u179f\u179a\u17be\u179f\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5',
      dataQuality: '\u1780\u17b6\u179a\u1785\u17d2\u179a\u17c4\u17c7\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799',
      langNote: '\u1780\u17b6\u179a\u1794\u1780\u1794\u17d2\u179a\u17c2\u1787\u17b6\u1797\u17b6\u179f\u17b6\u1781\u17d2\u1798\u17c2\u179a\u1793\u17c5\u1787\u17b6\u179f\u17c1\u1785\u1780\u17d2\u178f\u17b8\u178a\u17c6\u1794\u17bc\u1784 \u1793\u17b7\u1784\u178f\u17d2\u179a\u17bc\u179c\u1780\u17b6\u179a\u1780\u17b6\u179a\u1796\u17b7\u1793\u17b7\u178f\u17d2\u1799\u17d4',
      decorRoadNote: '\u1795\u17d2\u179b\u17bc\u179c\u1793\u17c5\u179b\u17be\u1795\u17c2\u1793\u1791\u17b8\u1782\u17ba\u179f\u1798\u17d2\u179a\u17b6\u1794\u17cb\u178f\u17bb\u1794\u178f\u17c2\u1784\u1794\u17c9\u17bb\u178e\u17d2\u178e\u17c4\u17c7\u17d4 \u179c\u17b6\u1798\u17b7\u1793\u1798\u17c2\u1793\u1798\u1780\u1796\u17b8\u1791\u17b7\u1793\u17d2\u1793\u1793\u17d0\u1799\u178e\u17b6\u1798\u17bd\u1799\u1791\u17c1\u17d4',
      timeCompressNote: '\u1796\u17c1\u179b\u179c\u17c1\u179b\u17b6\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1794\u1784\u17d2\u179a\u17bd\u1798\u17d4 \u178a\u17c6\u178e\u17b6\u1780\u17cb\u1780\u17b6\u179b \u17e3\u17e0 \u179c\u17b7\u1793\u17b6\u1791\u17b8 \u178f\u17c6\u178e\u17b6\u1784\u17b1\u17d2\u1799\u1785\u17d2\u179a\u17be\u1793\u1798\u17c9\u17c4\u1784\u17d4',
      village: '\u1797\u17bc\u1798\u17b7',
      you: '\u17a2\u17d2\u1793\u1780',
      fireL: '\u1797\u17d2\u179b\u17be\u1784',
      heatPointL: '\u1785\u17c6\u178e\u17bb\u1785\u1780\u17c6\u178a\u17c5',
      tileF: '\u1796\u17d2\u179a\u17c3\u1788\u17be\u178a\u17be\u1798 (\u1780\u1798\u17d2\u179a\u1786\u17c1\u17c7\u1780\u17d2\u1793\u17bb\u1784\u179a\u1799\u17c8\u1796\u17c1\u179b \u17e2\u17e5 \u1786\u17d2\u1793\u17b6\u17c6)',
      tilef: '\u1796\u17d2\u179a\u17c3\u1788\u17be \u1798\u17b6\u1793\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7\u1786\u17c1\u17c7\u1781\u17d2\u179b\u17c7',
      tileE: '\u1798\u17b6\u178f\u17cb\u1796\u17d2\u179a\u17c3 (\u1780\u1798\u17d2\u179a\u1786\u17c1\u17c7 \u1787\u17b6\u1794\u17cb\u1793\u17b9\u1784\u178a\u17b8\u1786\u17d2\u1780\u17b6\u179a)',
      tileC: '\u178a\u17b8\u1786\u17d2\u1780\u17b6\u179a / \u178a\u17b8\u1786\u17c1\u17c7\u178a\u178a\u17c2\u179b\u17d7',
      tileDot: '\u1782\u17d2\u1798\u17b6\u1793\u1780\u17c6\u178e\u178f\u17cb\u178f\u17d2\u179a\u17b6\u179a\u1780\u1783\u17be\u1789',
      fireNear: '\u1797\u17d2\u179b\u17be\u1784\u1793\u17c5\u1785\u1798\u17d2\u1784\u17b6\u1799 {km} \u1782\u17b8\u17a1\u17bc\u1798\u17c9\u17c2\u178f\u17d2\u179a',
      villageBurning: '\u1797\u17d2\u179b\u17be\u1784\u1794\u17b6\u1793\u1798\u1780\u178a\u179b\u17cb\u1797\u17bc\u1798\u17b7\u17a0\u17be\u1799!',
    }
  };

  let lang = 'en';

  function t(key, vars) {
    const d = I18N[lang] || I18N.en;
    let s = d[key];
    if (s === undefined) s = I18N.en[key];
    if (s === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(vars[k]);
      });
    }
    return s;
  }
  function setLang(l) { lang = l; }
  function getLang() { return lang; }

  function tileName(ch) {
    const key = ch === '.' ? 'tileDot' : 'tile' + ch;
    const d = I18N[lang] || I18N.en;
    if (d[key]) return d[key];
    return (I18N.en[key]) || ch;
  }

  /* =======================================================================
     DOM helpers
     ======================================================================= */
  const $ = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function applyStaticLang() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach(function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
    $('#lang-en').classList.toggle('is-active', lang === 'en');
    $('#lang-km').classList.toggle('is-active', lang === 'km');
  }

  /* =======================================================================
     AUDIO - all generated, no files
     ======================================================================= */
  const Audio = {
    ctx: null,
    muted: false,
    fireGain: null,
    fireSrc: null,

    ensure: function () {
      if (this.ctx) return this.ctx;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      return this.ctx;
    },

    resume: function () {
      const c = this.ensure();
      if (c && c.state === 'suspended') c.resume();
    },

    /** A short shaped tone. */
    blip: function (freq, dur, type, vol) {
      if (this.muted) return;
      const c = this.ensure();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(vol === undefined ? 0.12 : vol, c.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    },

    /** Footstep: a very short filtered noise burst. */
    step: function () {
      if (this.muted) return;
      const c = this.ensure();
      if (!c) return;
      const len = Math.floor(c.sampleRate * 0.05);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900 + Math.random() * 300;
      const g = c.createGain();
      g.gain.value = 0.07;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
    },

    /** Looping fire rumble; volume tracks how close the fire is. */
    startFire: function () {
      const c = this.ensure();
      if (!c || this.fireSrc) return;
      const len = Math.floor(c.sampleRate * 2);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // brown-ish noise crackle
        last = (last + (Math.random() * 2 - 1) * 0.1) * 0.96;
        d[i] = last * 3;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.7;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
      this.fireSrc = src;
      this.fireGain = g;
    },

    setFireLevel: function (v) {
      if (!this.fireGain) return;
      const target = this.muted ? 0 : Math.max(0, Math.min(0.22, v));
      this.fireGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
    },

    stopFire: function () {
      if (this.fireSrc) {
        try { this.fireSrc.stop(); } catch (e) { /* already stopped */ }
        this.fireSrc = null;
        this.fireGain = null;
      }
    },

    success: function () {
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        setTimeout(function () { Audio.blip(f, 0.4, 'triangle', 0.14); }, i * 110);
      });
    },
    failure: function () {
      [392, 311].forEach(function (f, i) {
        setTimeout(function () { Audio.blip(f, 0.55, 'sawtooth', 0.09); }, i * 170);
      });
    },

    setMuted: function (m) {
      this.muted = m;
      if (m) this.setFireLevel(0);
    }
  };

  /* =======================================================================
     SOURCES list (shared by the title screen and the About modal)
     ======================================================================= */
  function sourceList(scenario) {
    const wrap = el('div', 'src-list');
    scenario.sources.forEach(function (s) {
      const row = el('div', 'src' + (s.sample ? ' is-sample' : ''));
      row.appendChild(el('span', 'src-dot'));
      const body = el('div', 'src-body');
      const name = el('div', 'src-name');
      name.appendChild(el('span', null, s.name));
      if (s.sample) name.appendChild(el('span', 'badge badge-sample', t('sampleData')));
      else if (s.id === 'forest') name.appendChild(el('span', 'badge badge-derived', t('derived')));
      else name.appendChild(el('span', 'badge badge-real', t('realData')));
      body.appendChild(name);
      body.appendChild(el('div', 'src-detail', s.detail));
      if (s.file) body.appendChild(el('div', 'src-file', s.file));
      row.appendChild(body);
      wrap.appendChild(row);
    });

    // The road is ours, not anyone's data. Say so in the same list.
    const row = el('div', 'src is-decor');
    row.appendChild(el('span', 'src-dot'));
    const body = el('div', 'src-body');
    const name = el('div', 'src-name');
    name.appendChild(el('span', null, 'Road drawn on the map'));
    name.appendChild(el('span', 'badge badge-decor', t('decorative')));
    body.appendChild(name);
    body.appendChild(el('div', 'src-detail', t('decorRoadNote')));
    row.appendChild(body);
    wrap.appendChild(row);

    return wrap;
  }

  /* =======================================================================
     TITLE + CHARACTER SELECT
     ======================================================================= */
  function renderTitle(scenario) {
    const m = scenario.meta;
    const facts = $('#title-facts');
    facts.innerHTML = '';
    [
      [m.area.short, t('scenarioArea')],
      [String(m.quality.kept), 'detections ' + m.archive_years[0] + '-' + m.archive_years[1]],
      [m.area.width_km + ' × ' + m.area.height_km + ' km', 'area modelled'],
      [String(scenario.points.length), 'heat signals']
    ].forEach(function (f) {
      const d = el('div', 'fact');
      d.appendChild(el('span', 'fact-value', f[0]));
      d.appendChild(el('span', 'fact-label', f[1]));
      facts.appendChild(d);
    });
    $('#title-sources').innerHTML = '';
    $('#title-sources').appendChild(sourceList(scenario));
  }

  /** Draw a character's sprite into a small canvas for the select screen. */
  function charPreview(ch) {
    const c = document.createElement('canvas');
    c.width = 72; c.height = 96;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const img = Sprites.player(ch.id, 0, 0);
    x.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * 3, img.height * 3);
    return c;
  }

  function renderCharacterSelect(onPick, selectedId) {
    const grid = $('#char-grid');
    grid.innerHTML = '';
    Sprites.CHARACTERS.forEach(function (ch) {
      const card = el('button', 'char-card' + (ch.id === selectedId ? ' is-picked' : ''));
      card.type = 'button';
      card.setAttribute('aria-pressed', ch.id === selectedId ? 'true' : 'false');
      const art = el('div', 'char-art');
      art.appendChild(charPreview(ch));
      card.appendChild(art);
      card.appendChild(el('h3', 'char-name', t(ch.nameKey)));
      card.appendChild(el('p', 'char-desc', t(ch.descKey)));
      card.addEventListener('click', function () { onPick(ch); });
      grid.appendChild(card);
    });
  }

  /* =======================================================================
     HUD
     ======================================================================= */
  function renderObjectives(state) {
    const ul = $('#objectives');
    ul.innerHTML = '';
    /* The third objective is PENDING for the whole mission - it only resolves
       when the player wins or the fire arrives. Ticking it at the start (just
       because the village has not burned yet) read as "already done", which
       was wrong and misleading. */
    const items = [
      { done: state.priorityInspected, label: t('objInspect') },
      { done: state.villagePrepared, label: t('objPrepare') },
      {
        done: state.won === true,
        warn: state.villageLost,
        label: t('objSurvive')
      }
    ];
    items.forEach(function (it) {
      const li = el('li', 'obj' + (it.done ? ' is-done' : '') + (it.warn ? ' is-warn' : ''));
      li.appendChild(el('span', 'obj-box', it.done ? '✓' : (it.warn ? '✗' : '')));
      li.appendChild(el('span', 'obj-text', it.label));
      ul.appendChild(li);
    });
  }

  function renderPhase(state) {
    $('#phase-num').textContent = state.phase;
    const frac = state.phaseElapsed / state.phaseLength;
    $('#phase-bar-fill').style.width = (frac * 100).toFixed(1) + '%';
    const sun = $('#phase-sun');
    sun.textContent = state.phase === 1 ? '☀' : state.phase === 2 ? '⛅' : '☁';
  }

  function showPrompt(text, key) {
    const p = $('#prompt');
    $('#prompt-text').textContent = text;
    $('#prompt-key').textContent = key || 'E';
    p.hidden = false;
  }
  function hidePrompt() { $('#prompt').hidden = true; }

  function showDoing(text, frac) {
    const d = $('#doing');
    $('#doing-text').textContent = text;
    $('#doing-fill').style.width = (frac * 100).toFixed(1) + '%';
    d.hidden = false;
  }
  function hideDoing() { $('#doing').hidden = true; }

  /* =======================================================================
     MINI-MAP
     ======================================================================= */
  function renderMinimap(state, world, player) {
    const c = $('#minimap');
    const x = c.getContext('2d');
    const W = c.width, H = c.height;
    const sx = W / world.widthPx, sy = H / world.heightPx;

    x.clearRect(0, 0, W, H);

    // Land classes, sampled coarsely.
    const step = 3;
    for (let gy = 0; gy < world.sny; gy += step) {
      for (let gx = 0; gx < world.snx; gx += step) {
        const i = gy * world.snx + gx;
        const st = Fire.stateAt(i);
        let col;
        if (st === Fire.BURNT) col = '#2a2420';
        else if (st === Fire.BURNING) col = '#ff6a2a';
        else {
          const ch = World.classChars[world.cls[i]];
          col = ch === 'F' ? '#0d5c3d' : ch === 'f' ? '#1a6e4c'
            : ch === 'E' ? '#8a7a2a' : ch === 'C' ? '#8c4524' : '#3a4038';
        }
        x.fillStyle = col;
        x.fillRect(gx * World.cfg.SUB_PX * sx, gy * World.cfg.SUB_PX * sy,
          step * World.cfg.SUB_PX * sx + 1, step * World.cfg.SUB_PX * sy + 1);
      }
    }

    // Village
    x.fillStyle = state.villagePrepared ? '#42a878' : '#4f9ad6';
    dot(x, world.villageX * sx, world.villageY * sy, 4);

    // Heat points
    world.points.forEach(function (p) {
      x.fillStyle = p.inspected ? '#9aa79e' : '#d02b31';
      dot(x, p.x * sx, p.y * sy, 3);
    });

    // Player
    x.fillStyle = '#ffffff';
    dot(x, player.x * sx, player.y * sy, 3);

    // Viewport rectangle
    x.strokeStyle = 'rgba(255,255,255,.5)';
    x.lineWidth = 1;
    x.strokeRect(state.cam.x * sx, state.cam.y * sy, state.cam.w * sx, state.cam.h * sy);
  }

  function dot(x, cx, cy, r) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.6)';
    x.lineWidth = 1;
    x.stroke();
  }

  function renderMinimapLegend() {
    const n = $('#minimap-legend');
    n.innerHTML = '';
    [['#ffffff', t('you')], ['#d02b31', t('heatPointL')],
     ['#4f9ad6', t('village')], ['#ff6a2a', t('fireL')]].forEach(function (p) {
      const s = el('span', 'mm-leg');
      const sw = el('i');
      sw.style.background = p[0];
      s.appendChild(sw);
      s.appendChild(el('span', null, p[1]));
      n.appendChild(s);
    });
  }

  /* =======================================================================
     INFO PANEL
     ======================================================================= */
  function row(dl, label, value) {
    const r = el('div', 'info-row');
    r.appendChild(el('dt', null, label));
    r.appendChild(el('dd', null, value));
    dl.appendChild(r);
  }

  function showHeatPointInfo(point, scenario, character, player) {
    const p = point.data;
    $('#info-title').textContent = t('infoHeatPoint', { id: p.id });
    const body = $('#info-body');
    body.innerHTML = '';

    const head = el('div', 'info-badges');
    head.appendChild(el('span', 'badge badge-real', t('realData')));
    body.appendChild(head);

    const rows = el('div', 'info-rows');
    row(rows, t('timeDetected'), p.local_time);
    row(rows, t('detectionAge'), p.days_since_detection + ' d');
    row(rows, t('distToVillage'), p.dist_village_km + ' km');
    if (player) {
      row(rows, t('distToYou'),
        World.pxToKm(Math.hypot(player.x - point.x, player.y - point.y)).toFixed(1) + ' km');
    }
    if (p.rain && p.rain['7']) row(rows, t('rain7'), p.rain['7'].mm + ' mm');
    if (p.rain && p.rain['30']) row(rows, t('rain30'), p.rain['30'].mm + ' mm');
    if (p.temp_max_c != null) row(rows, t('maxTemp'), (Math.round(p.temp_max_c * 10) / 10) + ' °C');
    if (p.humidity_pct != null) row(rows, t('humidityL'), Math.round(p.humidity_pct) + ' %');
    row(rows, t('landClass'), p.on_forest_edge ? t('forestEdgeYes') : tileName(p.tile));
    row(rows, t('heatOutput'), p.frp_mw + ' MW');
    if (p.brightness_k) row(rows, t('brightness'), Math.round(p.brightness_k) + ' K');
    row(rows, t('sensorL'), p.sensor + ' / ' + p.satellite);
    row(rows, t('confidenceL'), p.confidence + ' (rank ' + p.confidence_rank + ')');
    row(rows, t('provinceL'), p.province);
    row(rows, t('coords'), p.lat.toFixed(4) + ', ' + p.lon.toFixed(4));
    body.appendChild(rows);

    // Data Scout perk: an extra rainfall-trend readout nobody else gets.
    if (character.perk.extraDetail && scenario.weather && scenario.weather.daily.length) {
      const box = el('div', 'scout-box');
      const h = el('div', 'scout-head');
      h.appendChild(el('span', null, t('rainTrend')));
      h.appendChild(el('span', 'badge badge-scout', t('scoutBonus')));
      box.appendChild(h);
      box.appendChild(miniRainSpark(scenario, p.date));
      body.appendChild(box);
    }

    body.appendChild(el('p', 'info-src', t('dataSource') + ': ' +
      srcName(scenario, 'firms')));
    $('#info-panel').hidden = false;
  }

  function showVillageInfo(scenario, world) {
    const v = scenario.village;
    $('#info-title').textContent = t('infoVillage');
    const body = $('#info-body');
    body.innerHTML = '';
    const head = el('div', 'info-badges');
    head.appendChild(el('span', 'badge badge-sample', t('sampleData')));
    body.appendChild(head);

    const rows = el('div', 'info-rows');
    row(rows, t('coords'), v.lat.toFixed(4) + ', ' + v.lon.toFixed(4));
    scenario.points.forEach(function (p) {
      row(rows, t('distToVillage') + ' → ' + p.id, p.dist_village_km + ' km');
    });
    body.appendChild(rows);
    body.appendChild(el('p', 'info-src', t('howPlaced') + ': ' + v.derivation));
    $('#info-panel').hidden = false;
  }

  function hideInfo() { $('#info-panel').hidden = true; }

  function srcName(scenario, id) {
    const s = scenario.sources.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id;
  }

  /** Tiny 14-day rainfall sparkline for the Data Scout panel.
   *  One series, one hue, no legend - the heading names it. */
  function miniRainSpark(scenario, upToDate) {
    const all = scenario.weather.daily.filter(function (d) { return d.rain_mm != null; });
    const idx = all.map(function (d) { return d.date; }).indexOf(upToDate);
    const end = idx >= 0 ? idx + 1 : all.length;
    const days = all.slice(Math.max(0, end - 14), end);
    const W = 240, H = 44, pad = 4;
    const max = Math.max.apply(null, days.map(function (d) { return d.rain_mm; })) || 1;
    const bw = (W - pad * 2) / days.length;
    let svg = '<svg class="spark-sm" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(t('rainTrend')) + '">';
    svg += '<line x1="0" y1="' + (H - 10) + '" x2="' + W + '" y2="' + (H - 10) +
      '" stroke="#2a3d33" stroke-width="1"/>';
    days.forEach(function (d, i) {
      const bh = (d.rain_mm / max) * (H - 16);
      const x = pad + i * bw;
      svg += '<g><title>' + esc(d.date + ': ' + d.rain_mm + ' mm') + '</title>';
      svg += '<rect x="' + x.toFixed(1) + '" y="' + (H - 10 - bh).toFixed(1) +
        '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + Math.max(0.8, bh).toFixed(1) +
        '" rx="1" fill="var(--rain)"/></g>';
    });
    svg += '<text x="2" y="9" fill="#6f8378" font-size="8">' + Math.round(max) + ' mm</text>';
    svg += '</svg>';
    const h = el('div');
    h.innerHTML = svg;
    return h.firstChild;
  }

  /* =======================================================================
     RESULT + WHY
     ======================================================================= */
  function renderResult(state, scenario) {
    const won = state.won;
    $('#result-icon').textContent = won ? '✅' : '🔥';
    $('#result-title').textContent = won ? t('missionComplete') : t('missionFailed');
    $('#result-sub').textContent = won ? t('completeSub') : t('failedSub');

    const pname = t('infoHeatPoint', { id: state.priorityId });
    const list = $('#result-checklist');
    list.innerHTML = '';

    function addCheck(ok, head, detail) {
      const c = el('div', 'check ' + (ok ? 'is-ok' : 'is-miss'));
      c.appendChild(el('span', 'check-icon', ok ? '✓' : '✗'));
      const b = el('div', 'check-text');
      b.appendChild(el('b', null, head));
      b.appendChild(el('span', null, detail));
      c.appendChild(b);
      list.appendChild(c);
    }

    addCheck(state.priorityInspected, t('checkPriority'),
      state.priorityInspected ? t('checkPriorityDone', { p: pname })
        : t('checkPriorityMiss', { p: pname }));
    addCheck(state.villagePrepared, t('checkVillage'),
      state.villagePrepared ? t('checkVillageDone') : t('checkVillageMiss'));
    addCheck(!state.villageLost, t('checkFire'),
      state.villageLost ? t('checkFireBad') : t('checkFireOk'));
    addCheck(!state.timeUp || state.won, t('checkTime'),
      state.timeUp && !state.won ? t('checkTimeBad')
        : t('checkTimeOk', { s: Math.max(0, Math.round(state.timeRemaining)) }));

    $('#btn-why').hidden = state.whyShown;
    $('#why-panel').hidden = !state.whyShown;
    if (state.whyShown) renderWhy(state, scenario);
  }

  function renderWhy(state, scenario) {
    const wrap = $('#why-panel');
    wrap.innerHTML = '';
    wrap.appendChild(el('p', 'why-intro', t('whyIntro')));

    const cards = el('div', 'risk-cards');
    const ordered = scenario.points.slice().sort(function (a, b) {
      return state.risks[b.id].score - state.risks[a.id].score;
    });

    ordered.forEach(function (p) {
      const r = state.risks[p.id];
      const card = el('div', 'risk-card' + (p.id === state.priorityId ? ' is-priority' : ''));
      const head = el('div', 'risk-card-head');
      const left = el('div');
      left.appendChild(el('h4', null, t('infoHeatPoint', { id: p.id })));
      left.appendChild(el('span', 'risk-band band-' + r.bandKey, r.band));
      if (p.id === state.priorityId) {
        const tag = el('span', 'badge badge-priority', t('priorityTag'));
        tag.style.marginLeft = '.35rem';
        left.appendChild(tag);
      }
      head.appendChild(left);
      const sc = el('div', 'risk-score');
      sc.appendChild(el('b', null, String(r.score)));
      sc.appendChild(el('span', null, t('outOf')));
      head.appendChild(sc);
      card.appendChild(head);

      const bar = el('div', 'risk-bar');
      const fill = el('i', 'bar-' + r.bandKey);
      fill.style.width = '0%';
      bar.appendChild(fill);
      card.appendChild(bar);
      requestAnimationFrame(function () { fill.style.width = r.score + '%'; });

      const fl = el('div', 'factors');
      r.factors.forEach(function (f) {
        const rw = el('div', 'factor dir-' + f.direction);
        const top = el('div', 'factor-top');
        top.appendChild(el('span', 'factor-name', f.label));
        const pts = el('span', 'factor-pts');
        pts.textContent = f.unknown ? t('unknownF')
          : (f.direction === 'raises' ? '▲ ' : f.direction === 'lowers' ? '▼ ' : '· ')
            + f.points + ' / ' + f.maxPoints;
        top.appendChild(pts);
        rw.appendChild(top);
        rw.appendChild(el('div', 'factor-val', f.display));
        if (f.evidence) rw.appendChild(el('div', 'factor-ev', f.evidence));
        fl.appendChild(rw);
      });
      card.appendChild(fl);
      cards.appendChild(card);
    });
    wrap.appendChild(cards);

    const chart = bigRainChart(scenario);
    if (chart) wrap.appendChild(chart);

    wrap.appendChild(fireExplain(scenario));

    const m = el('div', 'why-method');
    m.textContent = t('methodLabel') + ': ' + state.risks[state.priorityId].method;
    wrap.appendChild(m);
  }

  /** The full 61-day rainfall chart. Single series, single hue, no legend;
   *  the two detection dates are annotations, not a second series. */
  function bigRainChart(scenario) {
    const w = scenario.weather;
    if (!w || !w.daily || !w.daily.length) return null;
    const days = w.daily.filter(function (d) { return d.rain_mm != null; });
    if (!days.length) return null;

    const box = el('div', 'rain-chart');
    const h4 = el('h4', null, t('rainChartTitle'));
    if (w.sample) {
      const b = el('span', 'badge badge-sample', t('sampleData'));
      b.style.marginLeft = '.4rem';
      h4.appendChild(b);
    }
    box.appendChild(h4);
    box.appendChild(el('p', null, t('rainChartSub', {
      from: days[0].date, to: days[days.length - 1].date
    })));

    const W = 640, H = 82, padB = 18, padT = 6;
    const max = Math.max.apply(null, days.map(function (d) { return d.rain_mm; })) || 1;
    const bw = W / days.length;
    const plotH = H - padB - padT;

    const marks = {};
    scenario.points.forEach(function (p) { marks[p.date] = p.id; });

    let svg = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H +
      '" role="img" preserveAspectRatio="none" aria-label="' + esc(t('rainChartTitle')) + '">';
    svg += '<line x1="0" y1="' + (H - padB) + '" x2="' + W + '" y2="' + (H - padB) +
      '" stroke="#2a3d33" stroke-width="1"/>';

    days.forEach(function (d, i) {
      const bh = (d.rain_mm / max) * plotH;
      const x = i * bw;
      const bwi = Math.max(1, bw - 2);
      svg += '<g><title>' + esc(d.date + ': ' + d.rain_mm + ' mm' +
        (d.temp_max_c != null ? ', max ' + d.temp_max_c + ' °C' : '')) + '</title>';
      if (bh > 0.4) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + (H - padB - bh).toFixed(1) +
          '" width="' + bwi.toFixed(1) + '" height="' + bh.toFixed(1) +
          '" rx="1.5" fill="var(--rain)"/>';
      } else {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + (H - padB - 1) + '" width="' +
          bwi.toFixed(1) + '" height="1" fill="#2f4a3c"/>';
      }
      svg += '</g>';
      if (marks[d.date]) {
        const mx = x + bwi / 2;
        svg += '<line x1="' + mx.toFixed(1) + '" y1="' + padT + '" x2="' + mx.toFixed(1) +
          '" y2="' + (H - padB) + '" stroke="var(--risk-high)" stroke-width="2" ' +
          'stroke-dasharray="3 2" opacity=".9"/>';
        svg += '<text x="' + mx.toFixed(1) + '" y="' + (H - 5) +
          '" fill="#e8f0ea" font-size="10" font-weight="700" text-anchor="middle">' +
          esc(marks[d.date]) + '</text>';
      }
    });
    svg += '<text x="2" y="' + (padT + 8) + '" fill="#6f8378" font-size="9">' +
      Math.round(max) + ' mm</text></svg>';
    const h = el('div');
    h.innerHTML = svg;
    box.appendChild(h.firstChild);
    return box;
  }

  /** Explains the dryness number that drove fire spread. */
  function fireExplain(scenario) {
    const box = el('div', 'fire-explain');
    const f = scenario.fire;
    box.appendChild(el('h4', null, t('fireExplainTitle')));
    box.appendChild(el('p', 'fe-intro', t('fireExplainIntro')));

    const d = f.dryness;
    const bar = el('div', 'dry-bar');
    const fill = el('i');
    fill.style.width = '0%';
    bar.appendChild(fill);
    box.appendChild(bar);
    requestAnimationFrame(function () { fill.style.width = (d.score * 100).toFixed(0) + '%'; });
    box.appendChild(el('p', 'dry-score', 'Dryness ' + d.score.toFixed(2) + ' / 1.00'));

    const ul = el('ul', 'fe-list');
    d.factors.forEach(function (fa) {
      const li = el('li');
      li.appendChild(el('b', null, fa.key + ' '));
      li.appendChild(document.createTextNode(fa.detail +
        ' → ' + fa.sub_score.toFixed(2) + ' × weight ' + d.weights[fa.key]));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'fe-note', t('fireTimeNote')));
    return box;
  }

  /* =======================================================================
     MODAL
     ======================================================================= */
  function openModal(kind, scenario) {
    const m = scenario.meta;
    $('#modal-title').textContent = kind === 'roadmap' ? t('modalRoadmap') : t('modalAbout');
    const body = $('#modal-body');
    body.innerHTML = '';

    if (kind === 'roadmap') {
      body.innerHTML =
        '<h4>Planned next missions</h4><ul>' +
        '<li><b>Mission 2 — Community warning.</b> Route a warning to the right villages ' +
        'with a limited number of messages, and learn that a false alarm has a cost too.</li>' +
        '<li><b>Mission 3 — Resource allocation.</b> Split one team and one water truck ' +
        'across several simultaneous heat points over a week.</li></ul>' +
        '<h4>If a real model were trained later</h4>' +
        '<p>The archive holds 2.7 million detections over 25 years, enough to train a real ' +
        'next-7-day ignition-probability model per 1 km cell: label each cell-week by whether a ' +
        'detection followed, then train on dry-spell length, rainfall, temperature, burn history ' +
        'and distance to cleared land. Deliberately <b>not</b> built yet — this game ships ' +
        'transparent rules students can read.</p>' +
        '<h4>Swapping the area or the data</h4>' +
        '<p>Edit <code>CONFIG</code> at the top of <code>prepare_data.py</code> and re-run it. ' +
        'No game code is tied to this area.</p>';
    } else {
      body.appendChild(el('h4', null, t('dataSource')));
      body.appendChild(sourceList(scenario));

      const area = el('div');
      area.innerHTML = '<h4>' + esc(t('scenarioArea')) + '</h4><p>' + esc(m.area.name) +
        ' — ' + m.area.width_km + ' × ' + m.area.height_km + ' km, latitude ' +
        m.area.lat_min + ' to ' + m.area.lat_max + ', longitude ' + m.area.lon_min + ' to ' +
        m.area.lon_max + '.</p><p>Mission window ' + esc(m.window.start) + ' to ' +
        esc(m.window.end) + '; latest detection ' + esc(m.window.latest_detection) +
        '. In-game date ' + esc(m.game_today) + '. ' + m.quality.kept +
        ' detections kept across ' + m.archive_years[0] + '-' + m.archive_years[1] + '.</p>' +
        '<p><b>' + esc(t('timeCompressNote')) + '</b></p>';
      body.appendChild(area);

      const pick = el('div');
      let html = '<h4>' + esc(t('howPointsPicked')) + '</h4><ul>';
      (m.selection_notes || []).forEach(function (n) { html += '<li>' + esc(n) + '</li>'; });
      html += '</ul>';
      pick.innerHTML = html;
      body.appendChild(pick);

      const q = el('div');
      q.innerHTML = '<h4>' + esc(t('dataQuality')) + '</h4><ul>' +
        '<li>Rows read: ' + m.quality.rows_read + '</li>' +
        '<li>Inside the scenario area: ' + m.quality.in_box + '</li>' +
        '<li>Dropped, blank province: ' + (m.quality.dropped_empty_province || 0) + '</li>' +
        '<li>Dropped, zero FRP: ' + (m.quality.dropped_zero_frp || 0) + '</li>' +
        '<li>Dropped, saturated brightness (500 K): ' + (m.quality.dropped_saturated || 0) + '</li>' +
        '<li>Low-confidence detections were already excluded from the source archive.</li></ul>' +
        '<h4>Generated</h4><p>' + esc(m.generated_utc) + ' by <code>prepare_data.py</code></p>' +
        '<p>' + esc(t('langNote')) + '</p>';
      body.appendChild(q);
    }
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  /* ======================================================================= */
  global.UI = {
    I18N: I18N,
    t: t, setLang: setLang, getLang: getLang, tileName: tileName,
    applyStaticLang: applyStaticLang,
    Audio: Audio,
    sourceList: sourceList,
    renderTitle: renderTitle,
    renderCharacterSelect: renderCharacterSelect,
    renderObjectives: renderObjectives,
    renderPhase: renderPhase,
    showPrompt: showPrompt, hidePrompt: hidePrompt,
    showDoing: showDoing, hideDoing: hideDoing,
    renderMinimap: renderMinimap, renderMinimapLegend: renderMinimapLegend,
    showHeatPointInfo: showHeatPointInfo, showVillageInfo: showVillageInfo, hideInfo: hideInfo,
    renderResult: renderResult, renderWhy: renderWhy,
    openModal: openModal, closeModal: closeModal,
    $: $, $$: $$, el: el, esc: esc
  };
})(window);
