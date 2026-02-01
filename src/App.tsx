import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import NotificationColumn from './components/ui/NotificationColumn.tsx';
import { ShortcutBar } from './components/ui/shortcut-bar';
import { ComingSoonOverlay } from './components/ui/ComingSoonOverlay';
import { ParentAile } from './screens/ParentAile';
import { LegalNotice } from './screens/LegalNotice';
import { Dashboard } from './screens/Dashboard';
import { Forum } from './screens/Forum';
import { MyForum } from './screens/MyForum';
import { Discussion } from './screens/Discussion';
import { OpenAITest } from './screens/OpenAITest';
import { Introduction } from './screens/Teleconsultation/Introduction';
import { Preparation } from './screens/Teleconsultation/Preparation';
import { Writing } from './screens/Teleconsultation/Writing';
import { AIAssistant } from './screens/Teleconsultation/AIAssistant';
import { Confirmation } from './screens/Teleconsultation/Confirmation';
import { ScheduleAppointment } from './screens/Teleconsultation/ScheduleAppointment';
import { Admin } from './screens/Admin';
import { ConsultationsPage } from './screens/Admin/ConsultationsPage';
import { BooksPage } from './screens/Admin/BooksPage';
import { WorkshopsPage } from './screens/Admin/WorkshopsPage';
import { PromptsPage } from './screens/Admin/PromptsPage';
import { ShopPage } from './screens/Admin/ShopPage';
import OrdersPage from './screens/Admin/OrdersPage';
import { ConsultationDetails } from './screens/Admin/ConsultationDetails';
import { WorkshopManagement } from './screens/Instructor/WorkshopManagement';
import { Workshops } from './screens/Workshops';
import { Shop } from './screens/Shop';
import { KidsBooks } from './screens/Shop/KidsBooks';
import { ParentsBooks } from './screens/Shop/ParentsBooks';
import { BookDetails } from './screens/Shop/BookDetails';
import { CartPage } from './screens/Shop/CartPage';
import { ShippingPage } from './screens/Shop/ShippingPage';
import { ComingSoon } from './screens/Shop/ComingSoon';
import { Profile } from './screens/Profile';
import { MyConsultations } from './screens/MyConsultations';
import { NotificationBell } from './components/ui/NotificationBell';
import { Espace } from './screens/Espace';
import { EspaceDashboard } from './screens/Espace/EspaceDashboard';

// ============================================
// CONFIGURATION V0 - Fonctionnalités grisées
// ============================================
// Pour activer une fonctionnalité, passer la valeur à true
const V0_FEATURES = {
  forum: false,           // /partager, /my-forum, /discussion - Grisé
  ateliers: false,        // /ateliers, /mes-ateliers - Grisé
  boutique: false,        // /boutique/* - Grisé
  teleconsultation: false, // /teleconsultation/*, /my-consultations - Grisé (renommé "Faire le point")
  espacePersonnel: true,  // /profile, /dashboard - ACTIF
};

// Messages personnalisés par fonctionnalité
const COMING_SOON_MESSAGES = {
  forum: {
    title: "Forum - Bientôt disponible",
    message: "L'espace de partage et d'échange entre parents sera bientôt ouvert. Vous pourrez y poser vos questions et partager vos expériences."
  },
  ateliers: {
    title: "Ateliers - Bientôt disponible",
    message: "Des ateliers animés par des professionnels seront bientôt proposés pour vous accompagner dans votre parentalité."
  },
  boutique: {
    title: "Boutique - Bientôt disponible",
    message: "Une sélection de livres et ressources pour enfants et parents sera bientôt disponible."
  },
  teleconsultation: {
    title: "Faire le point - Bientôt disponible",
    message: "Cet espace vous permettra bientôt de faire le point sur votre situation et d'obtenir des conseils personnalisés."
  }
};

// Composant wrapper pour les routes grisées
const ComingSoonWrapper: React.FC<{
  feature: keyof typeof V0_FEATURES;
  children: React.ReactNode;
}> = ({ feature, children }) => {
  if (!V0_FEATURES[feature]) {
    const messages = COMING_SOON_MESSAGES[feature as keyof typeof COMING_SOON_MESSAGES];
    return <ComingSoonOverlay title={messages?.title} message={messages?.message} />;
  }
  return <>{children}</>;
};

const Layout = () => {
  const location = useLocation();
  const [isNotificationVisible, setIsNotificationVisible] = useState(true);

  const hideNotifications = location.pathname === "/" ||
                          location.pathname === "/mentions-legales" ||
                          location.pathname.startsWith("/admin") ||
                          location.pathname.startsWith("/espace");

  const toggleNotifications = () => {
    setIsNotificationVisible(!isNotificationVisible);
  };

  return (
    <>
      {!hideNotifications && (
        <>
          <NotificationColumn
            isVisible={isNotificationVisible}
            onToggle={toggleNotifications}
          />
          <NotificationBell
            isVisible={!isNotificationVisible}
            onClick={toggleNotifications}
          />
        </>
      )}
      <ShortcutBar />
      <Routes>
        {/* ========== ROUTES TOUJOURS ACTIVES ========== */}
        <Route path="/" element={<ParentAile />} />
        <Route path="/mentions-legales" element={<LegalNotice />} />
        <Route path="/test-openai" element={<OpenAITest />} />

        {/* ========== ESPACE PERSONNEL - ACTIF V0 ========== */}
        <Route path="/dashboard" element={
          <ComingSoonWrapper feature="espacePersonnel">
            <Dashboard />
          </ComingSoonWrapper>
        } />
        <Route path="/profile" element={
          <ComingSoonWrapper feature="espacePersonnel">
            <Profile />
          </ComingSoonWrapper>
        } />

        {/* ========== FORUM - GRISÉ V0 ========== */}
        <Route path="/partager" element={
          <ComingSoonWrapper feature="forum">
            <Forum />
          </ComingSoonWrapper>
        } />
        <Route path="/my-forum" element={
          <ComingSoonWrapper feature="forum">
            <MyForum />
          </ComingSoonWrapper>
        } />
        <Route path="/discussion/:postId" element={
          <ComingSoonWrapper feature="forum">
            <Discussion />
          </ComingSoonWrapper>
        } />

        {/* ========== TELECONSULTATION (Faire le point) - GRISÉ V0 ========== */}
        <Route path="/teleconsultation" element={
          <ComingSoonWrapper feature="teleconsultation">
            <Introduction />
          </ComingSoonWrapper>
        } />
        <Route path="/teleconsultation/preparation" element={
          <ComingSoonWrapper feature="teleconsultation">
            <Preparation />
          </ComingSoonWrapper>
        } />
        <Route path="/teleconsultation/writing" element={
          <ComingSoonWrapper feature="teleconsultation">
            <Writing />
          </ComingSoonWrapper>
        } />
        <Route path="/teleconsultation/ai" element={
          <ComingSoonWrapper feature="teleconsultation">
            <AIAssistant />
          </ComingSoonWrapper>
        } />
        <Route path="/teleconsultation/confirmation" element={
          <ComingSoonWrapper feature="teleconsultation">
            <Confirmation />
          </ComingSoonWrapper>
        } />
        <Route path="/teleconsultation/schedule" element={
          <ComingSoonWrapper feature="teleconsultation">
            <ScheduleAppointment />
          </ComingSoonWrapper>
        } />
        <Route path="/my-consultations" element={
          <ComingSoonWrapper feature="teleconsultation">
            <MyConsultations />
          </ComingSoonWrapper>
        } />

        {/* ========== ATELIERS - GRISÉ V0 ========== */}
        <Route path="/ateliers" element={
          <ComingSoonWrapper feature="ateliers">
            <Workshops />
          </ComingSoonWrapper>
        } />
        <Route path="/mes-ateliers" element={
          <ComingSoonWrapper feature="ateliers">
            <WorkshopManagement />
          </ComingSoonWrapper>
        } />

        {/* ========== BOUTIQUE - GRISÉ V0 ========== */}
        <Route path="/boutique" element={
          <ComingSoonWrapper feature="boutique">
            <Shop />
          </ComingSoonWrapper>
        } />
        <Route path="/boutique/livres-enfants" element={
          <ComingSoonWrapper feature="boutique">
            <KidsBooks />
          </ComingSoonWrapper>
        } />
        <Route path="/boutique/livres-parents" element={
          <ComingSoonWrapper feature="boutique">
            <ParentsBooks />
          </ComingSoonWrapper>
        } />
        <Route path="/boutique/livre/:id" element={
          <ComingSoonWrapper feature="boutique">
            <BookDetails />
          </ComingSoonWrapper>
        } />
        <Route path="/cart" element={
          <ComingSoonWrapper feature="boutique">
            <CartPage />
          </ComingSoonWrapper>
        } />
        <Route path="/shipping" element={
          <ComingSoonWrapper feature="boutique">
            <ShippingPage />
          </ComingSoonWrapper>
        } />
        <Route path="/boutique/coming-soon/:section" element={
          <ComingSoonWrapper feature="boutique">
            <ComingSoon />
          </ComingSoonWrapper>
        } />

        {/* ========== ESPACE PATIENT - Token requis ========== */}
        <Route path="/espace" element={<Espace />} />
        <Route path="/espace/dashboard" element={<EspaceDashboard />} />
        <Route path="/espace/*" element={<Espace />} />

        {/* ========== ADMIN - Toujours actif (protégé par auth) ========== */}
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/consultations" element={<ConsultationsPage />} />
        <Route path="/admin/orders" element={<OrdersPage />} />
        <Route path="/admin/books" element={<BooksPage />} />
        <Route path="/admin/workshops" element={<WorkshopsPage />} />
        <Route path="/admin/prompts" element={<PromptsPage />} />
        <Route path="/admin/shop" element={<ShopPage />} />
        <Route path="/admin/consultation/:consultationId" element={<ConsultationDetails />} />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <Router>
      <Layout />
    </Router>
  );
};

export default App;
