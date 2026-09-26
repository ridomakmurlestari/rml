RML v2.0.5 - Progress Clickable FIX 9

Root cause fixed: the modal was opened with an inline display:grid !important,
which prevented the .hidden class from closing it. The close function now clears
the inline display before adding .hidden. Open/close now use class visibility.
No Supabase schema/data changes.
