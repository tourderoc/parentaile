import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, where, limit, startAfter } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Search, Filter, Clock, Home, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CreatePost } from './CreatePost';

interface Post {
  id: string;
  content: string;
  category: string;
  authorId: string;
  authorPseudo: string;
  createdAt: Date;
  responseCount: number;
}

const POSTS_PER_PAGE = 5;

const categories = [
  { value: 'all', label: 'Toutes les catégories' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'education', label: 'Éducation' },
  { value: 'sante', label: 'Santé' },
  { value: 'developpement', label: 'Développement' },
  { value: 'alimentation', label: 'Alimentation' },
  { value: 'sommeil', label: 'Sommeil' },
  { value: 'autres', label: 'Autres' }
];

export const Forum = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        let postsQuery;

        if (selectedCategory === 'all') {
          postsQuery = query(
            collection(db, 'posts'),
            orderBy('createdAt', sortOrder),
            limit(POSTS_PER_PAGE)
          );
        } else {
          postsQuery = query(
            collection(db, 'posts'),
            where('category', '==', selectedCategory),
            orderBy('createdAt', sortOrder),
            limit(POSTS_PER_PAGE)
          );
        }

        const snapshot = await getDocs(postsQuery);
        const postsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        })) as Post[];

        setPosts(postsData);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching posts:', error);
        setLoading(false);
      }
    };

    fetchPosts();
  }, [selectedCategory, sortOrder]);

  const handleLoadMore = async () => {
    if (!lastVisible) return;

    try {
      let nextQuery;

      if (selectedCategory === 'all') {
        nextQuery = query(
          collection(db, 'posts'),
          orderBy('createdAt', sortOrder),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        nextQuery = query(
          collection(db, 'posts'),
          where('category', '==', selectedCategory),
          orderBy('createdAt', sortOrder),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      }

      const snapshot = await getDocs(nextQuery);
      const newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Post[];

      setPosts(prev => [...prev, ...newPosts]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
      setPage(prev => prev + 1);
    } catch (error) {
      console.error('Error loading more posts:', error);
    }
  };

  const filteredPosts = posts.filter(post =>
    post.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && posts.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-pink)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-pink)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Accueil
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-primary">Forum de partage</h1>
          </div>
          {auth.currentUser && (
            <Button
              onClick={() => setShowCreatePost(!showCreatePost)}
              className="bg-primary hover:bg-primary/90"
            >
              {showCreatePost ? 'Fermer' : 'Nouveau message'}
            </Button>
          )}
        </div>

        {showCreatePost && auth.currentUser && (
          <CreatePost 
            onPostCreated={() => {
              setShowCreatePost(false);
            }} 
          />
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 flex-1">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              className="flex-1 p-2 border rounded-md bg-white"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map(category => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
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

        <div className="mb-6">
          <div className="relative">
            <Input
              type="text"
              placeholder="Rechercher dans les messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <div className="space-y-6">
          {filteredPosts.map((post) => (
            <Link key={post.id} to={`/discussion/${post.id}`}>
              <Card className="p-6 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold">
                        {post.authorPseudo.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium">{post.authorPseudo}</h3>
                      <p className="text-sm text-gray-500">
                        {formatDistanceToNow(post.createdAt, { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    post.category === 'fatigue' ? 'bg-red-100 text-red-800' :
                    post.category === 'education' ? 'bg-blue-100 text-blue-800' :
                    post.category === 'sante' ? 'bg-green-100 text-green-800' :
                    post.category === 'developpement' ? 'bg-purple-100 text-purple-800' :
                    post.category === 'alimentation' ? 'bg-yellow-100 text-yellow-800' :
                    post.category === 'sommeil' ? 'bg-indigo-100 text-indigo-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {categories.find(c => c.value === post.category)?.label}
                  </span>
                </div>
                <p className="text-gray-700 mb-4">{post.content}</p>
                <div className="text-sm text-gray-500">
                  {post.responseCount} réponse{post.responseCount !== 1 ? 's' : ''}
                </div>
              </Card>
            </Link>
          ))}

          {filteredPosts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Aucun message dans cette catégorie</p>
            </div>
          ) : (
            <div className="flex justify-between items-center mt-8">
              <Button
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={page === 1}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Page précédente
              </Button>
              <span className="text-sm text-gray-500">
                Page {page}
              </span>
              <Button
                onClick={handleLoadMore}
                disabled={!hasMore || loading}
                variant="outline"
                className="flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Page suivante
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};