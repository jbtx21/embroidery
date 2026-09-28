"""
Stub for wx (wxPython) so Ink/Stitch can be imported without a GUI toolkit.
Meant only for headless, non-interactive runs (see run.py) -- wxPython has no
Linux wheel on PyPI, so instead of building it we fake the module.

Strategy:
- A sys.meta_path finder intercepts every import of `wx` and any `wx.*`
  submodule (e.g. `import wx`, `import wx.adv`,
  `from wx.lib.scrolledpanel import ScrolledPanel`) and hands back an empty
  but PEP-562-capable module.
- Attribute access on such a module (e.g. `wx.Panel`, `wx.ID_ANY`,
  `wx.lib.newevent`) returns a freshly created, per-name-cached stub CLASS.
  A class, not an instance: Ink/Stitch uses patterns like
  `class AboutFrame(wx.Frame): ...` -- the attribute has to be a real class
  to work as a base class.
- Stub classes are themselves transparent through a metaclass (class
  attributes like wx.propgrid.PG_LABEL as a parameter default), support
  bitwise operators for style flags (wx.YES_NO | wx.ICON_QUESTION), and are
  callable (constructor -> new instance).
- Instances of stub classes swallow every method call and every attribute
  access and hand back another stub object (chainable: a.b().c.d).
- Instances are also unpackable into exactly 2 values (__iter__ yields 2
  items), because wx code often uses the pattern
  `SomeEvent, EVT_SOME = wx.lib.newevent.NewEvent()` (event + binder). A grep
  of this Ink/Stitch checkout did not find that pattern, but the task
  description calls it out as a pitfall -- covered here just in case.

Important: this only covers MODULE-LEVEL code (imports, class definitions,
parameter defaults). Method bodies that actually use wx (opening windows,
binding events, drawing, ...) would NOT work meaningfully with these stubs --
but that is not needed here either: for the extensions run.py drives
(output, effect extensions such as fill_to_satin/auto_satin), only their
`Extension` classes are instantiated and `.run()`/`.effect()` is called; the
wx-heavy extensions (params, simulator, lettering, print_pdf,
satin_multicolor, sew_stack_editor, tartan, lettering_edit_json) are only
IMPORTED by lib/extensions/__init__.py, never executed.
"""

import sys
import types
import importlib.abc
import importlib.machinery


class _StubMeta(type):
    """Metaclass of the stub classes: makes class attributes (wx.Panel.FOO),
    inheritance (class X(wx.Panel)) and style-flag operators possible."""

    def __getattr__(cls, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        cache = cls.__dict__.get("_wx_children")
        if cache is None:
            cache = {}
            type.__setattr__(cls, "_wx_children", cache)
        if name not in cache:
            # IMPORTANT: (StubBase,) instead of (cls,) as the base. cls can be
            # a REAL Ink/Stitch class (e.g. RequestUpdateFrame(wx.Frame))
            # whose own __init__ demands required arguments. Inheriting from
            # it would blow up instantiation below (child_cls()). The child
            # class only needs StubBase's undemanding __init__.
            cache[name] = _StubMeta(f"{cls.__name__}.{name}", (StubBase,), {})
        return cache[name]

    # Style flags are combined with | and &, e.g. wx.YES_NO | wx.ICON_QUESTION
    def __or__(cls, other):
        return cls

    __and__ = __ror__ = __rand__ = __xor__ = __rxor__ = __or__

    def __repr__(cls):
        return f"<wx-stub class {cls.__name__}>"


class StubBase(metaclass=_StubMeta):
    """Base class of all stub objects. Instances swallow every call and every
    attribute access while staying chainable."""

    def __init__(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        # Cache the child class per name on the instance's own class (not
        # globally), so repeated access returns the same object.
        child_cls = getattr(type(self), name)
        return child_cls()

    def __call__(self, *args, **kwargs):
        return StubBase()

    def __iter__(self):
        # Covers patterns like `A, B = wx.lib.newevent.NewEvent()`.
        return iter((StubBase(), StubBase()))

    def __bool__(self):
        return False

    def __or__(self, other):
        return self

    __and__ = __ror__ = __rand__ = __xor__ = __rxor__ = __or__

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __repr__(self):
        return "<wx-stub instance>"


class _WxLoader(importlib.abc.Loader):
    def exec_module(self, module):
        fullname = module.__name__
        if module.__spec__.submodule_search_locations is None:
            module.__path__ = []  # mark as a package -> further wx.* imports work
        cache = {}

        def module_getattr(name, _cache=cache, _fullname=fullname):
            if name.startswith("__") and name.endswith("__"):
                raise AttributeError(name)
            if name not in _cache:
                _cache[name] = _StubMeta(f"{_fullname}.{name}", (StubBase,), {})
            return _cache[name]

        module.__getattr__ = module_getattr  # PEP 562


class _WxFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname == "wx" or fullname.startswith("wx."):
            return importlib.machinery.ModuleSpec(fullname, _WxLoader(), is_package=True)
        return None


_installed = False


def install():
    """Puts the finder at the front of sys.meta_path (idempotent)."""
    global _installed
    if _installed:
        return
    for name in list(sys.modules):
        if name == "wx" or name.startswith("wx."):
            del sys.modules[name]  # in case a failed import left something behind
    sys.meta_path.insert(0, _WxFinder())
    _installed = True
