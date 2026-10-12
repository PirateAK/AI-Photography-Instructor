<!-- ai-drafted — review before recording -->

# Post-Processing Techniques Lesson 3 - Retouching in Photoshop: less is more

## 1. LEARNING OUTCOME
By the end of this lesson, the student can execute a non-destructive Photoshop retouching workflow using dodge and burn, spot cleanup, and local masks to enhance portraits and landscapes invisibly.

## 2. TIMED LESSON OUTLINE
- **0:00 - 1:00** | Hook & Introduction: Why invisible retouching beats plastic skin.
- **1:00 - 3:00** | The Non-Destructive Setup: Smart Objects and Neutral 50% Gray Layers.
- **3:00 - 6:00** | Dodging and Burning: Sculpting light without destroying texture.
- **6:00 - 8:30** | Cleanup & Blemishes: Healing brushes, cloning, and content-aware tools.
- **8:30 - 9:30** | Local Adjustments with Masks: Fine-tuning contrast and color selectively.
- **9:30 - 10:00** | Wrap-Up & Practice Challenge.

## 3. NARRATION SCRIPT
Welcome back. Today we are talking about retouching in Photoshop, and I want to start with a confession. We have all slid that clarity or smoothness slider a bit too far at some point and ended up with skin that looks like wet plastic. It happens, and you never need to feel bad about it. But today, we are going to fix that habit for good. 

Our core philosophy for this lesson is simple: great retouching is invisible. The goal in Photoshop is making changes that nobody notices consciously, but everyone feels emotionally. When someone looks at your portrait or landscape, they should see a stunning, polished image—not the digital brushstrokes you used to get there. 

To achieve that, we rely entirely on a non-destructive workflow. That means every single adjustment we make lives on its own separate layer, completely detached from the original pixels underneath. If you hate what you did ten minutes ago, you just delete the layer or drop its opacity. No permanent damage done. 

Let us jump straight into Photoshop and set up our workspace. Open up your sample portrait image. Before we touch a single brush, we need to create our retouching foundation. First, right-click your background layer and select "Convert to Smart Object." A Smart Object is a container that protects your original image data and lets you apply filters and transformations without permanently altering pixels. 

Next, we are going to build our dodge and burn layer. Dodging, which comes from the old darkroom days of physically holding back light with your hands, brightens an area. Burning adds light back, making an area darker. Instead of using destructive adjustment brushes directly on the skin, we create a dedicated gray layer. Go to your layers panel, click the new layer icon, and name it "Dodge and Burn." Set the blending mode to "Soft Light"—which is a blend mode that makes 50% neutral gray completely invisible—and check the box that says "Fill with Soft-Light-neutral color: 50% gray." 

Now, when you paint on this layer with pure white paint, it brightens. When you paint with pure black paint, it darkens. And because it sits on its own layer, you can dial the layer opacity down to 15% or 20% so the effect is whisper-soft. 

Let us practice this right now. Select your brush tool by pressing B on your keyboard. Set your opacity in the top control bar to a very gentle 10%, and your flow to 10%. A low flow and opacity are your best friends in retouching; they let you build up the effect gradually, stroke by stroke, rather than slamming the image with a heavy hand. 

Zoom in to 100% on your subject's face. We want to find the natural contours of the face—the cheekbones, the bridge of the nose, the highlights on the forehead, and the gentle shadows under the jawline. Select white paint as your foreground color. Gently brush over the highlights on the cheekbone. You are not painting a new face; you are just whispering to the existing light, saying, "Hey, let us make this pop just a tiny bit more." 

Now press X to swap your foreground color to black. Gently brush underneath the cheekbone and along the jawline to add a touch of shadow depth. Take a look at your layers panel and click the visibility eyeball icon on and off. That is your original versus your dodge-and-burn layer. If it looks dramatic when you toggle it, your opacity is too high. Drop that layer opacity down until you have to squint to see the difference, but when you turn it off, the image suddenly looks flat and lifeless. That is the sweet spot. 

Next, let us talk about cleanup. Every portrait has temporary distractions—a stray hair blowing across the forehead, a minor blemish, or a dust spot on the sensor. For these, we use the Spot Healing Brush tool, which you can activate by pressing J. The Spot Healing Brush is an intelligent tool that samples the pixels surrounding the blemish and automatically blends them in to match the texture and color of the target area. 

Select a brush size just slightly larger than the distraction you want to remove. Ensure your top options bar is set to "Content-Aware." Now, click once on a stray hair crossing the forehead. Poof—it is gone, and the skin texture underneath remains completely intact. 

A quick tip here: never do cleanup on your main background layer. Always create a new blank layer above your dodge-and-burn layer, name it "Cleanup," and in the top options bar for the Healing Brush, make sure the checkbox for "Sample All Layers" is ticked. This ensures Photoshop looks at the pixels below while painting the corrections safely onto your empty cleanup layer. If you make a mistake, you just grab your eraser or paint over it again. 

Let us move on to local adjustments using masks. Sometimes global color grading or contrast adjustments affect parts of the image we want to leave alone. Suppose we want to punch up the contrast in the background trees of our outdoor portrait without affecting the subject's skin tones. 

Go to your adjustments panel and create a Curves adjustment layer. Drag the curve down slightly into an S-shape to add rich contrast and deep shadows to the background. Right now, that dark, contrasty look is clashing with our subject's face because the curve is affecting the entire frame. This is where layer masks come in. A layer mask is a companion to your adjustment layer that dictates where the adjustment is visible and where it is hidden. White reveals the adjustment; black conceals it. 

Select your Curves adjustment layer mask, which is the white rectangle next to the curves icon, and press Ctrl+I on Windows or Command+I on Mac to invert the mask to solid black. Instantly, your adjustments disappear because the black mask is hiding everything. 

Now, grab your brush tool, set your foreground color to pure white, and make sure your brush opacity is around 30%. Carefully paint over the background elements—the trees, the sky, the foliage—while keeping your brush entirely away from your subject. As you paint with white on the black mask, you are painting the rich curves adjustment exclusively into the background. 

Press the backslash key on your keyboard to toggle your mask overlay in red. This shows you exactly where you have painted. It is a fantastic way to check your work and make sure your edges are clean and precise. Press backslash again to turn the overlay off. 

Let us step back and review our complete non-destructive layer stack. We have our background Smart Object at the bottom, untouched and safe. Above that sits our 50% gray Dodge and Burn layer set to Soft Light blending mode. Above that is our dedicated Cleanup layer holding all our healing brush touch-ups. And at the top, we have our local adjustment layers with precise layer masks controlling where the light and color go. 

Turn off all your retouching layers at once using the top layer's visibility icon, and then turn them all back on. Look at the difference. The subject still looks entirely like themselves—every pore, freckle, and natural texture is right where it should be. Nothing looks plastic or over-processed. But the lighting is more flattering, the distractions are gone, and the background has a gorgeous, cinematic depth. 

That is the magic of invisible retouching. Take your time, keep your brush opacity low, and let your layers do the heavy lifting safely. I cannot wait to see what you create.

## 4. VISUAL AND SHOT PLAN
- **0:00 - 1:00** | Presenter on camera speaking directly to the viewer; cut to bad over-processed portrait example with heavy plastic skin for contrast.
- **1:00 - 3:00** | Screen recording of Photoshop workspace: showing Smart Object conversion and creating a 50% neutral gray layer set to Soft Light.
- **3:00 - 6:00** | Live software demo: zooming in to 100%, adjusting brush opacity to 10%, and painting highlights and shadows on the dodge and burn layer.
- **6:00 - 8:30** | Software demo: creating a blank cleanup layer, checking "Sample All Layers," and removing stray hairs and skin blemishes with the Spot Healing Brush.
- **8:30 - 9:30** | Software demo: adding a Curves adjustment layer, inverting the mask with Command/Ctrl+I, and painting white on the mask to reveal adjustments locally.
- **9:30 - 10:00** | Split screen showing original unedited portrait alongside the final non-destructively retouched version, toggling layers to demonstrate invisibility.

## 5. AI VIDEO CLIP PROMPTS
- **Prompt 1:** Cinematic close-up of a digital artist's hands using a drawing tablet stylus on a high-end monitor displaying a portrait photograph in Photoshop. Soft warm studio lighting, shallow depth of field, 4k resolution.
- **Prompt 2:** Macro shot of fine human skin texture under professional studio lighting, emphasizing natural pores and warm tones without digital smoothing. Photorealistic, soft morning light.
- **Prompt 3:** Time-lapse of a darkroom photography setup with red safelight, wet prints hanging on a clothesline to dry, vintage aesthetic, moody and atmospheric.

## 6. LEARNER PRACTICE
Open your practice portrait in Photoshop. Create a non-destructive retouching stack featuring a 50% gray Dodge and Burn layer set to Soft Light, a separate Cleanup layer for blemishes, and a localized adjustment layer with a mask. Use low opacity brushes (10-15%) to subtly sculpt light and remove distractions. Toggle the Master visibility button on and off—your goal is to achieve an edit where the differences are barely noticed by the eye, but deeply felt by the viewer.

## 7. RECAP
- Great retouching is invisible; your subject should look like a polished version of themselves, never like plastic.
- Always work non-destructively by converting your background to a Smart Object and using separate layers for dodging, burning, and cleanup.
- Keep your brush opacity and flow low (around 10-15%) so you can build adjustments up gradually rather than heavy-handedly.
- Use inverted layer masks (black masks revealed with white paint) to apply local contrast and color adjustments precisely where you want them.

## 8. ACCURACY CHECK
- **Question 1:** Why do we set the Dodge and Burn neutral gray layer blending mode to Soft Light?
  - **Answer:** Because Soft Light makes 50% neutral gray completely invisible, allowing you to paint black for shadows and white for highlights without affecting underlying pixel colors directly.
- **Question 2:** What is the primary advantage of converting your background layer to a Smart Object before editing?
  - **Answer:** It protects your original pixel data and allows you to apply filters, scaling, and transformations non-destructively.
- **Question 3:** When using the Spot Healing Brush for cleanup, why should you check "Sample All Layers" on a separate blank layer?
  - **Answer:** It lets Photoshop sample pixel data from layers below while painting the corrections onto an empty layer above, keeping your cleanup completely non-destructive and easy to edit or erase.
