import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { auth } from "../../lib/firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail, AuthError, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

interface LoginFormProps {
  onClose: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onClose();
      navigate("/dashboard");
    } catch (err) {
      const firebaseError = err as AuthError;
      console.error("Google sign-in error:", firebaseError);
      setError("Une erreur est survenue lors de la connexion avec Google");
    }
  };

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, values.email, values.password);
      onClose();
      navigate("/dashboard");
    } catch (err) {
      const firebaseError = err as AuthError;
      switch (firebaseError.code) {
        case 'auth/invalid-credential':
          setError("Email ou mot de passe incorrect");
          break;
        case 'auth/user-disabled':
          setError("Ce compte a été désactivé");
          break;
        case 'auth/user-not-found':
          setError("Aucun compte n'existe avec cet email");
          break;
        case 'auth/too-many-requests':
          setError("Trop de tentatives de connexion. Veuillez réessayer plus tard");
          break;
        default:
          setError("Une erreur est survenue lors de la connexion");
      }
      console.error("Login error:", firebaseError);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      setError("Veuillez entrer votre adresse e-mail");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await sendPasswordResetEmail(auth, resetEmail);
      setResetEmailSent(true);
    } catch (err) {
      const firebaseError = err as AuthError;
      if (firebaseError.code === 'auth/user-not-found') {
        setError("Aucun compte n'existe avec cet email");
      } else {
        setError("Une erreur est survenue. Vérifiez votre adresse e-mail.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showResetPassword) {
    return (
      <div className="space-y-6">
        {resetEmailSent ? (
          <div className="space-y-4">
            <div className="p-4 text-sm text-green-600 bg-green-50 rounded-md">
              Un e-mail de réinitialisation vous a été envoyé. Veuillez vérifier votre boîte mail.
            </div>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                setShowResetPassword(false);
                setResetEmailSent(false);
                setResetEmail("");
              }}
            >
              Retour à la connexion
            </Button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <FormLabel htmlFor="reset-email">Adresse e-mail</FormLabel>
              <Input
                id="reset-email"
                type="email"
                placeholder="votre@email.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Envoi en cours..." : "Envoyer un e-mail de réinitialisation"}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => setShowResetPassword(false)}
                disabled={isSubmitting}
              >
                Retour à la connexion
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Adresse e-mail</FormLabel>
              <FormControl>
                <Input id={field.name} type="email" placeholder="votre@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Mot de passe</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id={field.name}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="button"
          variant="link"
          className="text-sm text-primary hover:text-primary/80 p-0"
          onClick={() => setShowResetPassword(true)}
        >
          Mot de passe oublié ?
        </Button>

        <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
          Se connecter
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-muted-foreground">Ou</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          className="w-full"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 mr-2" />
          Connexion avec Google
        </Button>
      </form>
    </Form>
  );
};