import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { User, MessageSquare, Book, Loader2, Home, Calendar, Bot, Users, ShoppingBag } from 'lucide-react';
import { WelcomeMessageEditor } from './components/WelcomeMessageEditor';

interface Stats {
  totalUsers: number;
  totalConsultations: number;
  pendingConsultations: number;
}

export const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalConsultations: 0,
    pendingConsultations: 0
  });

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate('/');
          return;
        }

        const userDoc = await getDocs(query(
          collection(db, 'users'),
          where('uid', '==', user.uid),
          where('role', '==', 'admin')
        ));

        if (userDoc.empty) {
          navigate('/');
          return;
        }

        const [usersSnapshot, consultationsSnapshot] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'messages'))
        ]);

        setStats({
          totalUsers: usersSnapshot.size,
          totalConsultations: consultationsSnapshot.size,
          pendingConsultations: consultationsSnapshot.docs.filter(
            doc => doc.data().status === 'en_attente'
          ).length
        });

        setLoading(false);
      } catch (error) {
        console.error('Error checking admin access:', error);
        navigate('/');
      }
    };

    checkAdminAccess();
  }, [navigate]);

  const adminSections = [
    {
      title: "Consultations",
      icon: <Calendar className="w-8 h-8 text-primary" />,
      description: "Gérer les créneaux et consultations",
      link: "/admin/consultations",
      stat: `${stats.pendingConsultations} en attente`
    },
    {
      title: "Commandes",
      icon: <ShoppingBag className="w-8 h-8 text-primary" />,
      description: "Gérer les commandes et expéditions",
      link: "/admin/orders",
      stat: null
    },
    {
      title: "Livres",
      icon: <Book className="w-8 h-8 text-primary" />,
      description: "Gérer le catalogue de livres",
      link: "/admin/books",
      stat: null
    },
    {
      title: "Ateliers",
      icon: <Users className="w-8 h-8 text-primary" />,
      description: "Gérer les ateliers",
      link: "/admin/workshops",
      stat: null
    },
    {
      title: "Prompts IA",
      icon: <Bot className="w-8 h-8 text-primary" />,
      description: "Gérer les prompts d'IA",
      link: "/admin/prompts",
      stat: null
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
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-primary">
            Tableau de bord administrateur
          </h1>
          <Link to="/">
            <Button variant="outline" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </Link>
        </div>

        <WelcomeMessageEditor />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Utilisateurs inscrits</p>
                <p className="text-2xl font-bold text-primary">{stats.totalUsers}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total consultations</p>
                <p className="text-2xl font-bold text-primary">{stats.totalConsultations}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Book className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Consultations en attente</p>
                <p className="text-2xl font-bold text-primary">{stats.pendingConsultations}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {adminSections.map((section) => (
            <Card 
              key={section.title}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(section.link)}
            >
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {section.icon}
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">{section.title}</h3>
                  <p className="text-gray-600 mb-2">{section.description}</p>
                  {section.stat && (
                    <span className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                      {section.stat}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
