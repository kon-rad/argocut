import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorGradingEffectDefinition } from "./color-grading";

const defaultEffects = [blurEffectDefinition, colorGradingEffectDefinition];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
