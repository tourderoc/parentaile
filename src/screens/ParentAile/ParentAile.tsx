import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { AuthModal } from "../Auth/AuthModal";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { ShoppingCartIcon } from "../../components/ui/shopping-cart-icon";
import { 
  UserCircle2, 
  LogOut, 
  Mic, 
  Stethoscope, 
  Users, 
  ShoppingBag,
  Menu,
  X,
  Home 
} from "lucide-react";

export const ParentAile = (): JSX.Element => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pseudo, setPseudo] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWelcomeMessage = async () => {
      try {
        const messageDoc = await getDoc(doc(db, 'settings', 'welcome_message'));
        if (messageDoc.exists() && messageDoc.data().isPublished) {
          setWelcomeMessage(messageDoc.data().text);
        }
      } catch (error) {
        console.error('Error fetching welcome message:', error);
      }
    };

    fetchWelcomeMessage();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setPseudo(userDoc.data().pseudo);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setPseudo(null);
      }
    });

    // Prevent body scroll when mobile menu is open
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      unsubscribe();
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPseudo(null);
      navigate("/");
      setMobileMenuOpen(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleGoogleSignIn = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (auth.currentUser) return;
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        navigate("/dashboard");
        setMobileMenuOpen(false);
      }
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        alert('Please allow popups for this site to sign in with Google');
      } else {
        console.error("Error signing in with Google:", error);
      }
    }
  };

  const services = [
    {
      icon: <Mic className="w-12 h-12 text-primary" />,
      title: "Parlez. Ici, on vous écoute.",
      description: "Un espace bienveillant pour partager vos expériences",
      link: "/partager"
    },
    {
      icon: <Stethoscope className="w-12 h-12 text-primary" />,
      title: "Consultation avec un professionnel",
      description: "Un accompagnement personnalisé pour avancer",
      link: "/teleconsultation"
    },
    {
      icon: <Users className="w-12 h-12 text-primary" />,
      title: "Des ateliers pour avancer ensemble",
      description: "Participez à des sessions thématiques en groupe",
      link: "/ateliers"
    },
    {
      icon: <ShoppingBag className="w-12 h-12 text-primary" />,
      title: "La boutique",
      description: "Des ressources sélectionnées pour vous",
      link: "/boutique"
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--color-pink)]">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                <img 
                  src="/frame-8.png" 
                  alt="Parent'aile" 
                  className="h-16 object-contain"
                />
              </Link>
              <div className="hidden md:flex items-center gap-6">
                <Link to="/partager" className="text-gray-700 hover:text-primary">Partager</Link>
                <Link to="/teleconsultation" className="text-gray-700 hover:text-primary">Consultation</Link>
                <Link to="/ateliers" className="text-gray-700 hover:text-primary">Ateliers</Link>
                <Link to="/boutique" className="text-gray-700 hover:text-primary">Boutique</Link>
                <Link to="/dashboard" className="text-gray-700 hover:text-primary">Espace personnel</Link>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ShoppingCartIcon />
              {pseudo ? (
                <div className="flex items-center gap-4">
                  <Link 
                    to="/dashboard"
                    className="text-primary hover:text-primary/80 transition-colors hidden md:flex items-center gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <UserCircle2 className="w-5 h-5" />
                    <span className="font-medium">{pseudo}</span>
                  </Link>
                  <Button 
                    onClick={handleLogout}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden md:inline">Déconnexion</span>
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setShowAuthModal(true)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    Connexion
                  </Button>
                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    className="hidden md:flex items-center gap-2"
                  >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                    Google
                  </Button>
                </div>
              )}
              <button
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 top-[88px] bg-white z-50 md:hidden">
              <div className="flex flex-col gap-4 p-4">
                <Link 
                  to="/partager" 
                  className="text-gray-700 hover:text-primary p-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Partager
                </Link>
                <Link 
                  to="/teleconsultation" 
                  className="text-gray-700 hover:text-primary p-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Consultation
                </Link>
                <Link 
                  to="/ateliers" 
                  className="text-gray-700 hover:text-primary p-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Ateliers
                </Link>
                <Link 
                  to="/boutique" 
                  className="text-gray-700 hover:text-primary p-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Boutique
                </Link>
                <Link 
                  to="/dashboard" 
                  className="text-gray-700 hover:text-primary p-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Espace personnel
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Welcome Message */}
      {welcomeMessage && (
        <div className="bg-white/50 mt-8">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center">
            <p className="text-lg md:text-xl text-primary font-medium">
              {welcomeMessage}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Logo and Services */}
        <div className="grid md:grid-cols-3 gap-8 items-center">
          <div className="md:col-span-1">
            <div className="grid gap-4">
              {services.slice(0, 2).map((service, index) => (
                <div
                  key={index}
                  onClick={() => {
                    navigate(service.link);
                    setMobileMenuOpen(false);
                  }}
                  className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {service.icon}
                    <div>
                      <h3 className="font-medium mb-2">{service.title}</h3>
                      <p className="text-sm text-gray-600">{service.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-1 flex justify-center">
            <img 
              src="/frame-8.png" 
              alt="Parent'aile Tree" 
              className="w-48 h-48 md:w-64 md:h-64 object-contain"
            />
          </div>

          <div className="md:col-span-1">
            <div className="grid gap-4">
              {services.slice(2).map((service, index) => (
                <div
                  key={index}
                  onClick={() => {
                    navigate(service.link);
                    setMobileMenuOpen(false);
                  }}
                  className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {service.icon}
                    <div>
                      <h3 className="font-medium mb-2">{service.title}</h3>
                      <p className="text-sm text-gray-600">{service.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile App Section */}
        <div className="mt-12 bg-white rounded-lg p-4 md:p-6 text-center">
          <div className="flex flex-col items-center gap-6">
            <h2 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
              📱 Pour une expérience optimale sur mobile, téléchargez l'application Parent'aile
            </h2>
            
            <div className="flex items-center gap-6">
              <img 
                src="/app-icon.png"
                alt="Application Parent'aile"
                className="w-24 h-24 object-contain rounded-2xl shadow-lg"
              />
              
              <div className="flex flex-wrap justify-center gap-4">
                <a 
                  href="#"
                  className="opacity-50 cursor-not-allowed"
                  onClick={(e) => e.preventDefault()}
                >
                  <img
                    src="https://play.google.com/intl/en_us/badges/static/images/badges/fr_badge_web_generic.png"
                    alt="Disponible sur Google Play"
                    className="h-16"
                  />
                </a>
                
                <div className="opacity-25">
                  <img
                    src="https://developer.apple.com/app-store/marketing/guidelines/images/badge-download-on-the-app-store.svg"
                    alt="Bientôt disponible sur l'App Store"
                    className="h-16"
                  />
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-500">
              Version Android disponible prochainement. Version iOS en développement.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              "Il faut tout un village pour élever un enfant."
            </p>
            <div className="flex justify-center items-center gap-4">
              <Link to="/mentions-legales" className="text-gray-600 hover:text-primary">
                Mentions légales
              </Link>
              <a 
                href="mailto:contact@parentaile.fr" 
                className="text-gray-600 hover:text-primary"
              >
                contact@parentaile.fr
              </a>
            </div>
          </div>
        </div>
      </footer>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};