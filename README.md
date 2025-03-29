

# Accept Bitcoin Payment

A lightweight module for accepting Bitcoin payments by scanning HD wallet addresses derived from a provided zpub. This module converts a zpub to an xpub, scans derived addresses using the Blockstream API, and returns payment details including the next unused address and a sorted list of transactions.

## Features

- **HD Wallet Scanning:** Derives addresses from a given zpub.
- **Transaction Fetching:** Retrieves transaction details for each address via the Blockstream API.
- **Payment Information:** Processes transactions to identify sends and receives along with their amounts and timestamps.
- **Sorted Output:** Returns transactions sorted by timestamp (oldest to newest).

## Installation

Install via npm:

```bash
npm install accept-bitcoin-payment
```

## Usage

Below is an example of how to use the module in your project:

```js
import { fetchPaymentInfo, convertZpubToXpub } from "accept-bitcoin-payment";

const zpub = "your_zpub_here"; // Replace with your actual zpub

(async () => {
  try {
    const result = await fetchPaymentInfo(zpub);
    console.log("Next available address:", result.nextAddress);
    console.log("Transactions:", result.txns);
  } catch (error) {
    console.error("Error fetching payment info:", error);
  }
})();
```

## API

### `convertZpubToXpub(zpub: string): string`

Converts a zpub to an xpub by replacing the version bytes. This conversion is necessary for compatibility with the underlying BIP32 library.

- **Parameters:**
  - `zpub` (string): The extended public key in zpub format.
- **Returns:**
  - A string containing the converted xpub.

### `fetchPaymentInfo(zpub: string, branch?: number, startIndex?: number, gapLimit?: number): Promise<{ nextAddress: string, txns: Array<Object> }>`

Scans addresses derived from the provided zpub and gathers payment information.

- **Parameters:**
  - `zpub` (string): The extended public key in zpub format.
  - `branch` (number, optional): The derivation branch (0 for external addresses, 1 for change). Defaults to `0`.
  - `startIndex` (number, optional): The starting index for scanning. Defaults to `0`.
  - `gapLimit` (number, optional): The number of consecutive unused addresses to allow before stopping the scan. Defaults to `5`.
- **Returns:**
  - A Promise resolving to an object containing:
    - `nextAddress` (string): The first unused address.
    - `txns` (Array): An array of transaction objects, each with the following structure:
      ```js
      {
        address: "bitcoinaddress",
        txid: "transaction id",
        type: "send" | "receive",
        amount: amount_in_satoshis,
        timestamp: block_time_or_null
      }
      ```
      
Transactions are sorted by timestamp in ascending order.

## Contributing

Contributions, suggestions, and improvements are welcome! Please open an issue or submit a pull request on GitHub.
