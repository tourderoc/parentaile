import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Library, Gamepad2, ShieldCheck, Play, Download } from 'lucide-react';

/**
 * Les ressources de Parent'aile (10/11/2026) : des outils pour la famille, rangés par rubrique.
 * Pour l'instant, une seule rubrique (les jeux vidéo éducatifs) et un seul jeu ; on n'affiche pas de
 * rubrique vide. Ouvert à tous, sans compte : le jeu ne demande aucune connexion.
 */

interface Ressource {
  titre: string;
  accroche: string;
  texte: string;
  pastilles: string[];
  confiance: string;
  image: string;
  lien: string;
  /** L'écran « Installer le jeu » de la ressource (icône sur l'écran d'accueil, marche sans internet). */
  installer?: string;
}

interface Rubrique { titre: string; icone: typeof Gamepad2; ressources: Ressource[] }

const RUBRIQUES: Rubrique[] = [
  {
    titre: 'Jeux vidéo éducatifs',
    icone: Gamepad2,
    ressources: [
      {
        titre: 'La bataille de la multiplication',
        accroche: 'Un jeu qui réunit la famille.',
        texte: 'Parent et enfant, côte à côte sur la tablette : on calcule pour lever son armée, puis on part à la bataille. Les tables s\'apprennent en jouant, du CP au CM2.',
        pastilles: ['Tablette recommandée', 'CP → CM2', '2 à 4 joueurs', 'Aussi à distance', 'Gratuit, sans publicité'],
        confiance: 'Les progrès de l\'enfant restent sur la tablette : rien n\'est envoyé sur internet.',
        image: '/assets/ressources/bataille-multiplication.jpg',
        lien: 'https://jeu.parentaile.fr',
        installer: 'https://jeu.parentaile.fr/?installer',
      },
    ],
  },
];

const Cartouche = ({ r, i }: { r: Ressource; i: number }) => (
  <motion.article
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.1 + i * 0.08 }}
    className="rounded-[2rem] border border-white/60 bg-white/60 backdrop-blur-xl shadow-premium overflow-hidden"
  >
    <div className="relative h-48 overflow-hidden">
      <img src={r.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <h3 className="absolute bottom-3 left-5 right-5 text-xl font-extrabold text-white tracking-tight drop-shadow-md">{r.titre}</h3>
    </div>
    <div className="px-5 py-5 space-y-3">
      <p className="text-lg font-extrabold text-orange-500">{r.accroche}</p>
      <p className="text-sm text-gray-600 leading-relaxed">{r.texte}</p>
      <div className="flex flex-wrap gap-1.5">
        {r.pastilles.map(p => (
          <span key={p} className="text-[10px] font-extrabold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2.5 py-1">{p}</span>
        ))}
      </div>
      <div className="flex items-start gap-2 bg-green-50/80 border border-green-100 rounded-xl px-3 py-2">
        <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold text-green-800">{r.confiance}</p>
      </div>
      <a
        href={r.lien}
        target="_blank"
        rel="noopener"
        className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-orange-400 to-orange-500 rounded-xl text-sm uppercase tracking-wider font-extrabold text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all border border-orange-400/50"
      >
        <Play size={16} className="fill-white" /> Jouer
      </a>
      {r.installer && (
        <a
          href={r.installer}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-2 w-full py-3 glass bg-white/60 rounded-xl text-sm uppercase tracking-wider font-extrabold text-orange-600 shadow-sm hover:bg-white/80 active:scale-[0.98] transition-all border border-orange-200"
        >
          <Download size={16} /> Télécharger le jeu
        </a>
      )}
    </div>
  </motion.article>
);

export const Ressources = () => {
  const navigate = useNavigate();
  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-20%] w-96 h-96 bg-orange-300/50 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-80 h-80 bg-rose-300/40 rounded-full blur-[90px] pointer-events-none" />

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-white/60 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/espace/dashboard')}
            className="w-10 h-10 glass rounded-xl flex items-center justify-center shadow-glass active:scale-95 transition-transform"
            aria-label="Retour"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Library size={18} className="text-orange-500" />
            <h1 className="text-lg font-extrabold text-gray-800 tracking-tight">Ressources</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-10 relative z-10">
        <div className="max-w-md mx-auto px-6 py-6 space-y-8">
          {RUBRIQUES.map(rub => (
            <section key={rub.titre} className="space-y-4">
              <div className="flex items-center gap-2">
                <rub.icone size={16} className="text-orange-500" />
                <h2 className="text-[11px] font-extrabold text-orange-500 uppercase tracking-[0.2em]">{rub.titre}</h2>
              </div>
              {rub.ressources.map((r, i) => <Cartouche key={r.titre} r={r} i={i} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Ressources;
