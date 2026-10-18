import { startTransition, type FormEvent } from "react";

// React resets an uncontrolled form once a `<form action>` submission
// settles — a refused one included, which would wipe what the person typed
// at the very moment the error appears beside it. Dispatching by hand inside
// a transition keeps the values and still drives useActionState's `pending`.
// The form keeps its `action` prop too, so without JavaScript it still posts.
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
