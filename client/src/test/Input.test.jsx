import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Input from '../components/ui/Input';

describe('Input accessible labels and feedback', () => {
    test('associates generated labels with distinct input ids', () => {
        render(<><Input label="Contact name" /><Input label="Contact email" type="email" /></>);
        const name = screen.getByRole('textbox', { name: 'Contact name' });
        const email = screen.getByRole('textbox', { name: 'Contact email' });
        expect(name.id).toBeTruthy();
        expect(email.id).not.toBe(name.id);
    });

    test('retains explicit ids, refs and help text alongside validation feedback', () => {
        const ref = createRef();
        render(<>
            <p id="contact-help">Use an address you can access.</p>
            <Input ref={ref} id="contact-email" label="Email" aria-describedby="contact-help" error="Enter a valid email." />
        </>);
        const input = screen.getByRole('textbox', { name: 'Email' });
        expect(ref.current).toBe(input);
        expect(input.id).toBe('contact-email');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription('Use an address you can access. Enter a valid email.');
    });
});
