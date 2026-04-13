export const amoy = {
    id: 80002,
    name: "Polygon Amoy Testnet",
    network: "polygon-amoy",
    iconUrl: "",
    iconBackground: "#000000",
    nativeCurrency: {
        decimals: 18,
        name: "POL",
        symbol: "POL",
    },
    rpcUrls: {
        default: {
            http: [
                "https://rpc-amoy.polygon.technology/",
                "https://polygon-amoy.drpc.org",
                "https://polygon-amoy-bor-rpc.publicnode.com",
            ],
        },
    },
    blockExplorers: {
        default: {
            name: "PolygonScan",
            url: "https://amoy.polygonscan.com/",
        },
    },
};
