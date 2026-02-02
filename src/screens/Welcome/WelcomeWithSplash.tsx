/**
 * WelcomeWithSplash - Wrapper qui gère le splash + welcome
 *
 * Flow :
 * 1. Splash animation (3s, skip après 1ère visite)
 * 2. Welcome screen avec 2 boutons
 */

import React, { useState } from 'react';
import { SplashScreen } from '../../components/ui/SplashScreen';
import { Welcome } from './index';

export const WelcomeWithSplash: React.FC = () => {
  const [splashComplete, setSplashComplete] = useState(false);

  if (!splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }

  return <Welcome />;
};

export default WelcomeWithSplash;
