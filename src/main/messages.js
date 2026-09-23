'use strict';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

module.exports = {
  alert: (label) => pick([
    `Hé ! ${label} ? Pas maintenant 😾`,
    `${label}… je m'en occupe 🐾`,
    `Oh non, pas ${label} 🙀`,
    `Je te vois ! ${label}, on ferme ça 😼`,
    `${label} ? Nope nope nope 🙅`,
  ]),
  closed: () => pick([
    'Voilà. On se reconcentre ? 💪',
    'Mission accomplie 😼',
    'De rien 😽',
    'Allez, au boulot ! 🐾',
    'Hop, disparu ✨',
  ]),
  relief: () => pick([
    'Bien joué, tu as résisté ! ✨',
    'Bon réflexe 😸',
    'Ouf, fausse alerte 😺',
  ]),
  focusStart: (m) => pick([
    `C'est parti pour ${m} min de focus 🎧`,
    `${m} minutes, rien que toi et ton travail 🎧`,
    `Focus activé : ${m} min. Je monte la garde 😼`,
  ]),
  focusDone: () => pick([
    'Bravo ! Session terminée 🎉',
    'Session bouclée, champion·ne 🏆',
    'Et une session de plus ! 🎉',
  ]),
  focusStopped: () => 'Focus arrêté. On remettra ça 🐾',
  breakStart: (m) => `Pause de ${m} min ! Étire-toi un peu 🙆`,
  breakDone: () => pick(['Pause terminée, on y retourne ? 🐾', 'Allez, on reprend ! 💪']),
  breakReminder: (m) => `${m} min de travail d'affilée… une petite pause ? ☕`,
  welcomeBack: () => pick(['Oh, te revoilà ! 😺', 'Re ! On s\'y remet ? 🐾', 'Bon retour 😽']),
  snooze: (m) => `D'accord, ${m} min de répit… je t'ai à l'œil 👀`,
  snoozeEnd: () => 'Les blocages sont de retour 😼',
};
