import { beforeEach } from "bun:test";
import { resetPredictionNetworkState } from "./services/fetch";

// Every test answers from a mocked network. Without a fresh budget per test,
// the suite's earlier requests to one host use up the 120 a minute limit and a
// later test waits past its timeout; a shared download one test left hanging
// would do the same.
beforeEach(() => {
  resetPredictionNetworkState();
});
