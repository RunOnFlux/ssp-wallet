import axios, { AxiosResponse } from 'axios';
import { sspConfig } from '@storage/ssp';

interface RelayApiResponse {
  status?: string;
  success?: boolean;
  data?: {
    action: string;
    payload: string;
    chain: string;
    path: string;
    wkIdentity: string;
    createdAt: string;
    expireAt: string;
  };
  message?: string;
  error?: string;

  // Direct response format (for GET requests)
  wkIdentity?: string;
  action?: string;
  payload?: string;
  chain?: string;
  path?: string;
  createdAt?: string;
  expireAt?: string;
}

/**
 * Simplified WalletConnect relay service using SSP Relay's action API
 *
 * Uses the TESTED working action API format that already supports WalletConnect
 */
export class WalletConnectRelayService {
  private baseUrl: string;
  private pollInterval: number = 2000; // 2 seconds
  private maxRetries: number = 150; // 5 minutes total (150 * 2s)

  constructor() {
    this.baseUrl = `https://${sspConfig().relay}`;
  }

  private generateRequestId(): string {
    return `wc_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Send WalletConnect signing request using the action API
   */
  async sendSigningRequest(
    method: string,
    params: unknown[],
    chain: string,
    wkIdentity: string,
    metadata?: { dappName: string; dappUrl: string },
  ): Promise<{ approved: boolean; result?: string; error?: string }> {
    const requestId = this.generateRequestId();

    console.log('[WalletConnect Relay] Sending signing request:', {
      method,
      requestId,
      chain,
      wkIdentity,
    });

    const signingPayload = {
      type: 'walletconnect',
      id: requestId,
      method,
      params,
      metadata: {
        dappName: metadata?.dappName || 'Unknown dApp',
        dappUrl: metadata?.dappUrl || '',
      },
      timestamp: Date.now(),
    };

    // Send using the action API format that works
    const requestData = {
      action: 'walletconnect',
      payload: JSON.stringify(signingPayload),
      chain,
      path: '0-0',
      wkIdentity,
    };

    try {
      const response: AxiosResponse<RelayApiResponse> = await axios.post(
        `${this.baseUrl}/v1/action`,
        requestData,
      );

      console.log(
        '[WalletConnect Relay] Request sent successfully:',
        response.data,
      );

      // Start polling for response
      return this.pollForResponse(requestId, wkIdentity);
    } catch (error) {
      console.error('[WalletConnect Relay] Failed to send request:', error);
      throw new Error('Failed to send WalletConnect request');
    }
  }

  /**
   * Poll for response from SSP Key
   */
  private async pollForResponse(
    requestId: string,
    wkIdentity: string,
  ): Promise<{ approved: boolean; result?: string; error?: string }> {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        console.log(
          `[WalletConnect Relay] Polling for response ${requestId} (${
            retries + 1
          }/${this.maxRetries})`,
        );

        const response: AxiosResponse<RelayApiResponse> = await axios.get(
          `${this.baseUrl}/v1/action/${wkIdentity}`,
        );

        if (
          response.data &&
          response.data.action === 'walletconnect_response'
        ) {
          try {
            const responsePayload = JSON.parse(
              response.data.payload as string,
            ) as {
              requestId?: string;
              approved?: boolean;
              result?: string;
              error?: string;
            };

            // Check if this response is for our request
            if (responsePayload.requestId === requestId) {
              console.log(
                '[WalletConnect Relay] Response received:',
                responsePayload,
              );
              return {
                approved: responsePayload.approved || false,
                result: responsePayload.result,
                error: responsePayload.error,
              };
            }
          } catch {
            // Not valid JSON or not our response format, continue polling
          }
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
        retries++;
      } catch (error) {
        console.log('[WalletConnect Relay] Polling error (will retry):', error);
        retries++;
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      }
    }

    throw new Error('WalletConnect request timeout - no response from SSP Key');
  }

  /**
   * Test method to verify relay functionality
   */
  async testConnection(): Promise<boolean> {
    try {
      const testPayload = { test: true, timestamp: Date.now() };
      const response = await axios.post(`${this.baseUrl}/v1/action`, {
        action: 'walletconnect',
        payload: JSON.stringify(testPayload),
        chain: 'eth',
        path: '0-0',
        wkIdentity: 'test_connection',
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const walletConnectRelay = new WalletConnectRelayService();
