import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { auth, db } from "../../lib/firebase";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { validatePseudo } from "../../lib/pseudoFilter";

const usernameSchema = z.object({
  username: z.string().min(3, "Le pseudo doit contenir au moins 3 caractères"),
});

const emailSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

interface RegisterFormProps {
  onClose: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [validatedUsername, setValidatedUsername] = useState<string | null>(null);

  const usernameForm = useForm<z.infer<typeof usernameSchema>>({
    resolver: zodResolver(usernameSchema),
    defaultValues: {
      username: "",
    },
  });

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Validation du pseudo via le service local (sans IA)
  // Vérifie: format, mots interdits, et disponibilité dans Firebase

  const handleGoogleSignIn = async () => {
    if (!validatedUsername) return;

    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        pseudo: validatedUsername,
        date_inscription: serverTimestamp()
      });

      onClose();
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      setError("Une erreur est survenue lors de l'inscription avec Google");
    }
  };

  const onUsernameSubmit = async (values: z.infer<typeof usernameSchema>) => {
    try {
      setError(null);
      setIsValidatingUsername(true);

      // Validation complète: format + mots interdits + disponibilité
      const validation = await validatePseudo(values.username);
      if (!validation.valid) {
        setError(validation.error || "Ce pseudo n'est pas valide.");
        return;
      }

      setValidatedUsername(values.username);
      setStep(2);
    } catch (error) {
      console.error("Username validation error:", error);
      setError("Une erreur est survenue lors de la validation du pseudo");
    } finally {
      setIsValidatingUsername(false);
    }
  };

  const onEmailSubmit = async (values: z.infer<typeof emailSchema>) => {
    if (!validatedUsername) return;

    try {
      setError(null);
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      
      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: values.email,
        pseudo: validatedUsername,
        date_inscription: serverTimestamp()
      });

      onClose();
      navigate("/dashboard");
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError("Un compte existe déjà avec cet e-mail");
      } else {
        setError("Une erreur est survenue lors de l'inscription. Veuillez réessayer.");
      }
      console.error("Registration error:", err);
    }
  };

  if (step === 1) {
    return (
      <Form {...usernameForm}>
        <form onSubmit={usernameForm.handleSubmit(onUsernameSubmit)} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <FormField
            control={usernameForm.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Choisissez votre pseudo</FormLabel>
                <FormControl>
                  <Input placeholder="Votre pseudo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 flex items-center justify-center gap-2"
            disabled={isValidatingUsername}
          >
            {isValidatingUsername ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Vérification...
              </>
            ) : (
              <>
                Continuer
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-primary">
        <span>Pseudo validé :</span>
        <span className="font-medium">{validatedUsername}</span>
      </div>

      <div className="grid gap-6">
        <Button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-2"
          variant="outline"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
          Continuer avec Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-muted-foreground">Ou</span>
          </div>
        </div>

        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse e-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="votre@email.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={emailForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
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

            <FormField
              control={emailForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmer le mot de passe</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
              Créer mon compte
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};