import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ArrowLeft, Users, Home } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Post {
  id: string;
  content: string;
  category: string;
  authorId: string;
  authorPseudo: string;
  createdAt: Date;
  participants: string[];
  responseCount: number;
  lastResponseAt?: Date;
  lastReadAt?: Date;
}

export const MyForum = () => {
  const navigate = useNavigate();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [participatedPosts, setParticipatedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [view, setView] = useState<'publications' | 'participations'>('publications');
  const [unreadPosts, setUnreadPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/');
      return;
    }

    try {
      setLoading(true);

      // Subscribe to user's posts
      const postsQuery = query(
        collection(db, 'posts'),
        where('authorId', '==', user.uid),
        orderBy('createdAt', sortOrder)
      );

      const unsubscribePosts = onSnapshot(postsQuery, async (snapshot) => {
        const userPosts = await Promise.all(snapshot.docs.map(async doc => {
          const postData = doc.data();
          
          // Get the latest response timestamp
          const latestResponseQuery = query(
            collection(db, 'responses'),
            where('postId', '==', doc.id),
            where('authorId', '!=', user.uid),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          
          const latestResponseSnap = await getDocs(latestResponseQuery);
          const lastResponseAt = latestResponseSnap.empty ? null : latestResponseSnap.docs[0].data().createdAt.toDate();

          // Get the last read timestamp from local storage
          const lastReadAt = localStorage.getItem(`post_${doc.id}_lastRead`);

          // Update unread posts set
          if (lastResponseAt && (!lastReadAt || new Date(lastReadAt) < lastResponseAt)) {
            setUnreadPosts(prev => new Set([...prev, doc.id]));
          }

          return {
            id: doc.id,
            ...postData,
            createdAt: postData.createdAt?.toDate() || new Date(),
            lastResponseAt,
            lastReadAt: lastReadAt ? new Date(lastReadAt) : null
          };
        }));

        let filteredPosts = userPosts;
        if (selectedCategory !== 'all') {
          filteredPosts = filteredPosts.filter(post => post.category === selectedCategory);
        }

        setMyPosts(filteredPosts);
      });

      // Subscribe to responses for participated posts
      const responsesQuery = query(
        collection(db, 'responses'),
        where('authorId', '==', user.uid)
      );

      const unsubscribeResponses = onSnapshot(responsesQuery, async (snapshot) => {
        const postIds = [...new Set(snapshot.docs.map(doc => doc.data().postId))];

        if (postIds.length > 0) {
          const participatedQuery = query(
            collection(db, 'posts'),
            orderBy('createdAt', sortOrder)
          );

          const participatedSnapshot = await getDocs(participatedQuery);
          let participatedPosts = await Promise.all(
            participatedSnapshot.docs
              .filter(doc => postIds.includes(doc.id) && doc.data().authorId !== user.uid)
              .map(async doc => {
                const postData = doc.data();
                
                // Get the latest response timestamp
                const latestResponseQuery = query(
                  collection(db, 'responses'),
                  where('postId', '==', doc.id),
                  where('authorId', '!=', user.uid),
                  orderBy('createdAt', 'desc'),
                  limit(1)
                );
                
                const latestResponseSnap = await getDocs(latestResponseQuery);
                const lastResponseAt = latestResponseSnap.empty ? null : latestResponseSnap.docs[0].data().createdAt.toDate();

                // Get the last read timestamp from local storage
                const lastReadAt = localStorage.getItem(`post_${doc.id}_lastRead`);

                // Update unread posts set
                if (lastResponseAt && (!lastReadAt || new Date(lastReadAt) < lastResponseAt)) {
                  setUnreadPosts(prev => new Set([...prev, doc.id]));
                }

                return {
                  id: doc.id,
                  ...postData,
                  createdAt: postData.createdAt?.toDate() || new Date(),
                  lastResponseAt,
                  lastReadAt: lastReadAt ? new Date(lastReadAt) : null
                };
              })
          );

          if (selectedCategory !== 'all') {
            participatedPosts = participatedPosts.filter(post => post.category === selectedCategory);
          }

          setParticipatedPosts(participatedPosts);
        } else {
          setParticipatedPosts([]);
        }
      });

      return () => {
        unsubscribePosts();
        unsubscribeResponses();
      };
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  }, [navigate, selectedCategory, sortOrder]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const displayedPosts = view === 'publications' ? myPosts : participatedPosts;

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/dashboard">
            <Button variant="ghost" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour au tableau de bord
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Users className="w-8 h-8" />
            Mes messages
          </h1>
        </div>

        <Card className="p-6">
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 flex gap-4">
              <Button
                variant={view === 'publications' ? 'default' : 'outline'}
                onClick={() => setView('publications')}
                className="flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Mes publications ({myPosts.length})
              </Button>
              <Button
                variant={view === 'participations' ? 'default' : 'outline'}
                onClick={() => setView('participations')}
                className="flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Mes participations ({participatedPosts.length})
              </Button>
            </div>

            <Link to="/partager">
              <Button className="bg-primary hover:bg-primary/90">
                Nouvelle discussion
              </Button>
            </Link>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <select
                className="flex-1 p-2 border rounded-md bg-white"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">Toutes les catégories</option>
                <option value="fatigue">Fatigue</option>
                <option value="education">Éducation</option>
                <option value="sante">Santé</option>
                <option value="developpement">Développement</option>
                <option value="alimentation">Alimentation</option>
                <option value="sommeil">Sommeil</option>
                <option value="autres">Autres</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="p-2 border rounded-md bg-white"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              >
                <option value="desc">Plus récents</option>
                <option value="asc">Plus anciens</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {displayedPosts.length > 0 ? (
              displayedPosts.map((post) => (
                <Link 
                  key={post.id} 
                  to={`/discussion/${post.id}`}
                  state={{ from: '/my-forum' }}
                >
                  <Card 
                    className="p-4 hover:shadow-md transition-shadow cursor-pointer relative"
                  >
                    {unreadPosts.has(post.id) && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        post.category === 'fatigue' ? 'bg-red-100 text-red-800' :
                        post.category === 'education' ? 'bg-blue-100 text-blue-800' :
                        post.category === 'sante' ? 'bg-green-100 text-green-800' :
                        post.category === 'developpement' ? 'bg-purple-100 text-purple-800' :
                        post.category === 'alimentation' ? 'bg-yellow-100 text-yellow-800' :
                        post.category === 'sommeil' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {post.category}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDistanceToNow(post.createdAt, { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{post.authorPseudo}</span>
                    </div>
                    <p className="text-gray-600 line-clamp-2">{post.content}</p>
                  </Card>
                </Link>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  {view === 'publications' 
                    ? "Vous n'avez pas encore créé de discussion"
                    : "Vous n'avez pas encore participé à des discussions"
                  }
                </p>
                <Link to="/partager">
                  <Button className="bg-primary hover:bg-primary/90">
                    {view === 'publications' 
                      ? 'Créer une discussion'
                      : 'Parcourir les discussions'
                    }
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};