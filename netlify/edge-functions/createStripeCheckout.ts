import Stripe from "https://esm.sh/stripe@14.19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { items, shippingInfo, success_url, cancel_url, orderId } = await req.json();

    if (!items?.length) {
      throw new Error("No items provided");
    }

    if (!success_url || !cancel_url) {
      throw new Error("Missing success_url or cancel_url");
    }

    // Create session with shipping information if provided
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card"],
      line_items: items.map((item: any) => ({
        price_data: {
          currency: "eur",
          product_data: {
            name: item.title,
            images: item.image_url ? [item.image_url] : undefined,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url,
      cancel_url,
    };

    // Initialize metadata object
    sessionParams.metadata = {};

    // Add order ID to metadata if provided
    if (orderId) {
      sessionParams.metadata.orderId = orderId;
      console.log(`Including orderId in metadata: ${orderId}`);
    }

    // Add shipping information as metadata if provided
    if (shippingInfo) {
      sessionParams.metadata.shippingInfo = JSON.stringify(shippingInfo);
      
      // No shipping address collection or email pre-filling
      // We already collected this information on our custom shipping page
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
};
