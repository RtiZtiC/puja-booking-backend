// Vercel Serverless Function for Shopify Draft Orders
// File location: api/create-draft-order.js

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests'
    });
  }

  // Get environment variables
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const SHOPIFY_API_VERSION = '2024-01';

  // Validate environment variables
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_API_TOKEN) {
    console.error('Missing environment variables');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: Missing Shopify credentials',
      hint: 'Set SHOPIFY_STORE_URL and SHOPIFY_ADMIN_API_TOKEN in Vercel environment variables'
    });
  }
  
  try {
    const { mutation, variables, paymentId, totalAmount } = req.body;
    
    // Validate request body
    if (!mutation || !variables) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: mutation and variables',
        received: { 
          hasMutation: !!mutation, 
          hasVariables: !!variables,
          hasPaymentId: !!paymentId,
          hasTotalAmount: !!totalAmount
        }
      });
    }
    
    console.log('Creating draft order for payment:', paymentId);
    console.log('Total amount:', totalAmount);
    
    // Make GraphQL request to Shopify
    const shopifyUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    
    const shopifyResponse = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables
      })
    });
    
    // Check if request was successful
    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error:', shopifyResponse.status, errorText);
      return res.status(shopifyResponse.status).json({
        success: false,
        error: 'Shopify API request failed',
        statusCode: shopifyResponse.status,
        details: errorText
      });
    }
    
    const data = await shopifyResponse.json();
    
    console.log('Shopify response:', JSON.stringify(data, null, 2));
    
    // Check for GraphQL errors
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return res.status(400).json({
        success: false,
        errors: data.errors
      });
    }
    
    // Extract draft order from response
    const draftOrder = data.data?.draftOrderCreate?.draftOrder;
    const userErrors = data.data?.draftOrderCreate?.userErrors;
    
    // Check for user errors
    if (userErrors && userErrors.length > 0) {
      console.error('User errors:', userErrors);
      return res.status(400).json({
        success: false,
        errors: userErrors
      });
    }
    
    // Verify draft order was created
    if (!draftOrder) {
      console.error('No draft order in response');
      return res.status(500).json({
        success: false,
        error: 'Failed to create draft order',
        details: data
      });
    }
    
    console.log('✅ Draft order created successfully:', draftOrder.name);
    
    // Return success response
    return res.status(200).json({
      success: true,
      data: data.data,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl || null,
      paymentId: paymentId,
      totalAmount: totalAmount
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
