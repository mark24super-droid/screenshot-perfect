import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/Button";
import { FieldError, Input, Label } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../lib/api";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters.").max(200),
    confirmPassword: z.string().min(1, "Confirm your password."),
    workspaceName: z.string().trim().max(100).optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type FormValues = z.infer<typeof schema>;

const BENEFITS = [
  "A visual editor with node-level validation",
  "Simulation runs that never touch a real inbox",
  "AI-generated drafts you review before saving",
];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", workspaceName: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signup({
        name: values.name,
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName?.trim() || undefined,
      });
      toast({ title: "Account created", description: "Finish setup to open your workspace.", variant: "success" });
      navigate(params.get("next") || "/onboarding", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <AuthLayout
      heading="Create your account"
      subheading="Build your first automation in minutes. No credit card, no code."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-relaxed text-rose-700">
            {formError}
          </div>
        ) : null}

        <div>
          <Label htmlFor="name" required>
            Full name
          </Label>
          <Input id="name" autoComplete="name" placeholder="Alex Morgan" {...register("name")} aria-invalid={Boolean(errors.name)} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="email" required>
            Work email
          </Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} aria-invalid={Boolean(errors.email)} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="8+ characters"
                className="pr-9"
                {...register("password")}
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-secondary hover:text-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <FieldError>{errors.password?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="confirmPassword" required>
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat password"
              {...register("confirmPassword")}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            <FieldError>{errors.confirmPassword?.message}</FieldError>
          </div>
        </div>

        <div>
          <Label htmlFor="workspaceName">Workspace name (optional)</Label>
          <Input id="workspaceName" placeholder="e.g. Acme Studio" maxLength={100} {...register("workspaceName")} />
          <FieldError>{errors.workspaceName?.message}</FieldError>
          <p className="hint">You can rename this during setup.</p>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <Sparkles size={15} /> Create free account <ArrowRight size={15} />
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-secondary">
          By creating an account you agree to the{" "}
          <Link to="/terms" className="font-medium text-primary hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>
          . New workspaces start on the Free plan.
        </p>
      </form>

      <div className="mt-5 rounded-lg border border-line bg-app/60 p-3">
        <p className="text-[11px] font-semibold text-ink">What you get on Free</p>
        <ul className="mt-2 space-y-1.5">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-secondary">
              <Check size={12} className="mt-0.5 shrink-0 text-success" /> {benefit}
            </li>
          ))}
        </ul>
      </div>
    </AuthLayout>
  );
}
