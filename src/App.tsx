import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import NotificationColumn from './components/ui/NotificationColumn.tsx';
import { ShortcutBar } from './components/ui/shortcut-bar';
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

const Layout = () => {
  const location = useLocation();
  const [isNotificationVisible, setIsNotificationVisible] = useState(true);
  
  const hideNotifications = location.pathname === "/" || 
                          location.pathname === "/mentions-legales" || 
                          location.pathname.startsWith("/admin");

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
        <Route path="/" element={<ParentAile />} />
        <Route path="/mentions-legales" element={<LegalNotice />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/partager" element={<Forum />} />
        <Route path="/my-forum" element={<MyForum />} />
        <Route path="/discussion/:postId" element={<Discussion />} />
        <Route path="/test-openai" element={<OpenAITest />} />
        <Route path="/teleconsultation" element={<Introduction />} />
        <Route path="/teleconsultation/preparation" element={<Preparation />} />
        <Route path="/teleconsultation/writing" element={<Writing />} />
        <Route path="/teleconsultation/ai" element={<AIAssistant />} />
        <Route path="/teleconsultation/confirmation" element={<Confirmation />} />
        <Route path="/teleconsultation/schedule" element={<ScheduleAppointment />} />
        <Route path="/my-consultations" element={<MyConsultations />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/consultations" element={<ConsultationsPage />} />
        <Route path="/admin/orders" element={<OrdersPage />} />
        <Route path="/admin/books" element={<BooksPage />} />
        <Route path="/admin/workshops" element={<WorkshopsPage />} />
        <Route path="/admin/prompts" element={<PromptsPage />} />
        <Route path="/admin/shop" element={<ShopPage />} />
        <Route path="/admin/consultation/:consultationId" element={<ConsultationDetails />} />
        <Route path="/mes-ateliers" element={<WorkshopManagement />} />
        <Route path="/ateliers" element={<Workshops />} />
        <Route path="/boutique" element={<Shop />} />
        <Route path="/boutique/livres-enfants" element={<KidsBooks />} />
        <Route path="/boutique/livres-parents" element={<ParentsBooks />} />
        <Route path="/boutique/livre/:id" element={<BookDetails />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/shipping" element={<ShippingPage />} />
        <Route path="/boutique/coming-soon/:section" element={<ComingSoon />} />
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
