import React from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const navigate = useNavigate();

  const handleReturn = () => {
    onClose();
    navigate('/');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative my-8">
        <button 
          onClick={handleReturn}
          className="block w-full text-center mb-6 text-gray-600 hover:text-primary transition-colors"
        >
          ← Retour à l'accueil
        </button>
        
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="login" className="text-lg">Se connecter</TabsTrigger>
            <TabsTrigger value="register" className="text-lg">S'inscrire</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <LoginForm onClose={onClose} />
          </TabsContent>
          
          <TabsContent value="register">
            <RegisterForm onClose={onClose} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};