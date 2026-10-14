import { expect, test } from "bun:test";
import { polymarketBookErrorText } from "./detail";

test("a book failure keeps the status and drops the request URL", () => {
  const error = new Error(
    "Request failed (404) for https://clob.polymarket.com/book?token_id=yes-1",
  );
  expect(polymarketBookErrorText(error)).toBe("Request failed (404)");
  expect(polymarketBookErrorText(error)).not.toContain("http");
  expect(polymarketBookErrorText(error)).not.toContain("polymarket");
  expect(polymarketBookErrorText(new Error("https://clob.polymarket.com/book?token_id=1"))).toBe(
    "Order book unavailable.",
  );
  expect(polymarketBookErrorText(new Error("Order book timed out."))).toBe("Order book timed out.");
});
