import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { 
  User, 
  MessageSquare, 
  Calendar, 
  Users, 
  ShoppingBag,
  ChevronRight,
  Loader2,
  Home,
  TestTube
} from "lucide-react";

export const Dashboard = () => {
  const [pseudo, setPseudo] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate("/");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setPseudo(userDoc.data().pseudo);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching user data:", error);
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  const menuItems = [
    {
      icon: <User className="w-8 h-8 text-primary" />,
      title: "Mes informations personnelles",
      description: "Gérez votre profil, vos préférences et vos paramètres",
      link: "/profile"
    },
    {
      icon: <MessageSquare className="w-8 h-8 text-primary" />,
      title: "Mes messages",
      description: "Accédez à vos discussions sur le forum",
      link: "/my-forum"
    },
    {
      icon: <Calendar className="w-8 h-8 text-primary" />,
      title: "Mes consultations",
      description: "Suivez vos rendez-vous et demandes de consultation",
      link: "/my-consultations"
    },
    {
      icon: <Users className="w-8 h-8 text-primary" />,
      title: "Mes ateliers",
      description: "Retrouvez les ateliers auxquels vous êtes inscrit(e)",
      link: "/ateliers"
    },
    {
      icon: <ShoppingBag className="w-8 h-8 text-primary" />,
      title: "Mes achats",
      description: "Consultez l'historique de vos commandes",
      link: "/orders",
      comingSoon: true
    },
    {
      icon: <TestTube className="w-8 h-8 text-primary" />,
      title: "Test",
      description: "Zone de test et expérimentation",
      link: "/test-openai"
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end mb-4">
          <Link to="/">
            <Button variant="outline" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-primary mb-2">
              Bonjour {pseudo} 👋
            </h1>
            <p className="text-gray-600">
              Bienvenue dans votre espace personnel Parent'aile
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {menuItems.map((item, index) => (
              <Card 
                key={index}
                className={`p-6 transition-all hover:shadow-md ${
                  item.comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
                onClick={() => !item.comingSoon && navigate(item.link)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                      {!item.comingSoon && (
                        <ChevronRight className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <p className="text-gray-600">{item.description}</p>
                    {item.comingSoon && (
                      <span className="inline-block mt-2 text-sm text-primary bg-primary/10 px-2 py-1 rounded">
                        Bientôt disponible
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};