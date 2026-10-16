import { expect, test } from "bun:test";
import { MoonsError } from "../src/errors";
import {
  isNotFoundSignal,
  isRedirectSignal,
  notFound,
  redirect,
  NotFoundSignal,
  RedirectSignal,
} from "../src/signals";

test("redirect(): default 302, membawa to/status, dan terdeteksi guard", () => {
  let thrown: unknown;
  try {
    redirect("/login");
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RedirectSignal);
  const signal = thrown as RedirectSignal;
  expect(signal.to).toBe("/login");
  expect(signal.status).toBe(302);
  expect(isRedirectSignal(signal)).toBe(true);
  expect(isNotFoundSignal(signal)).toBe(false);
});

test("redirect(): status eksplisit didukung; status tak didukung → E_INTERNAL", () => {
  let thrown: unknown;
  try {
    redirect("/x", 303);
  } catch (error) {
    thrown = error;
  }
  expect((thrown as RedirectSignal).status).toBe(303);

  let invalid: unknown;
  try {
    redirect("/x", 200 as unknown as 302);
  } catch (error) {
    invalid = error;
  }
  expect(invalid).toBeInstanceOf(MoonsError);
  expect((invalid as MoonsError).format()).toContain("E_INTERNAL");

  let empty: unknown;
  try {
    redirect("  ");
  } catch (error) {
    empty = error;
  }
  expect(empty).toBeInstanceOf(MoonsError);
});

test("notFound(): sinyal + guard; error biasa bukan sinyal", () => {
  let thrown: unknown;
  try {
    notFound();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(NotFoundSignal);
  expect(isNotFoundSignal(thrown)).toBe(true);
  expect(isRedirectSignal(thrown)).toBe(false);
  expect(isRedirectSignal(new Error("biasa"))).toBe(false);
  expect(isNotFoundSignal(null)).toBe(false);
});
