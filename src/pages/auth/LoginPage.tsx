import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, FlaskConical, LogIn } from "lucide-react";
import { AuthLayout, DemoAccessNote, SocialProofRow } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/Button";
import { FieldError, Input, Label } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../lib/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, demoLogin, flags } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [demoLoading, setDemoLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const destination = params.get("next") || "/dashboard";

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const response = await login(values.email, values.password);
      toast({ title: "Welcome back", description: `Signed in as ${response.user.email}.`, variant: "success" });
      navigate(response.user.settings.onboardingCompleted ? destination : "/onboarding", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  const handleDemo = async () => {
    setFormError(null);
    setDemoLoading(true);
    try {
      await demoLogin();
      toast({ title: "Demo workspace ready", description: "Sample data and simulated runs only.", variant: "success" });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthLayout
      heading="Welcome back"
      subheading="Sign in to review your automations, connections and execution history."
      footer={
        <>
          New to FlowMate?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create a free account
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
          <Label htmlFor="email" required>
            Email address
          </Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} aria-invalid={Boolean(errors.email)} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required>
              Password
            </Label>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              className="pr-10"
              {...register("password")}
              aria-invalid={Boolean(errors.password)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-secondary hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <FieldError>{errors.password?.message}</FieldError>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <LogIn size={15} /> Sign in
        </Button>
      </form>

      {flags.demoLoginEnabled ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-secondary">or explore first</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={() => void handleDemo()} loading={demoLoading}>
            <FlaskConical size={15} /> Open the demo workspace
          </Button>
          <DemoAccessNote />
        </div>
      ) : (
        <p className="mt-5 text-[11px] leading-relaxed text-ink-secondary">
          Demo login is disabled on this deployment. Create an account to build automations in simulation mode.
        </p>
      )}

      <div className="mt-6 border-t border-line pt-4">
        <SocialProofRow />
      </div>
    </AuthLayout>
  );
}
