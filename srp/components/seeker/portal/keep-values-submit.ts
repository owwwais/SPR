"use client";

import { startTransition, type FormEvent } from "react";

// A <form action={...}> resets every uncontrolled field once its action
// settles — including when the action came back with a validation error,
// which on an edit form throws away exactly what the person just typed.
// These forms edit values that are already saved, so they dispatch the
// action themselves and keep the fields as they are; the page re-renders
// with the saved values after a successful save anyway.
export function keepValuesSubmit(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
