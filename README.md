# Accept Bitcoin Payment

A lightweight module for accepting Bitcoin payments by scanning HD wallet addresses derived from a provided zpub. This module converts a zpub to an xpub, scans derived addresses using the Blockstream API, and returns payment details including the next unused address and a sorted list of transactions.

## Features

- **HD Wallet Scanning:** Derives addresses from a given zpub.
- **Transaction Fetching:** Retrieves transaction details for each address via the Blockstream API.
- **Payment Information:** Processes transactions to identify sends and receives along with their amounts and timestamps.
- **Sorted Output:** Returns transactions sorted by timestamp (oldest to newest).

## Installation

```bash
npm install accept-bitcoin-payment
```

## Usage

```js
import { nextAddress } from "accept-bitcoin-payment";

const zpub =
  "zpub6qU3pMzBXcDxURjEZXDna8h8VJvDAmmUChYspM5NEZvHYxW5z48wKM8uMSqwY5pJEML41Aq7FC3hLSwa14EG42mVA1izYJzxo9TSt4W7Xii";

(async () => {
  try {
    const { index, address } = await nextAddress(zpub);

    console.log("Next Address:", address);
  } catch (error) {
    console.error("Error:", error);
  }
})();
```

## Contributing

Contributions, suggestions, and improvements are welcome! Please open an issue or submit a pull request on GitHub.
