import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from './button';
import { ShoppingBag } from 'lucide-react';
import { useCartStore } from '../../lib/cart';

export const ShoppingCartIcon = () => {
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Link to="/cart">
      <Button variant="ghost" className="relative">
        <ShoppingBag className="w-5 h-5" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </Button>
    </Link>
  );
};