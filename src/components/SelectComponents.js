import {components} from 'react-select';

export const customStyles = {
  control: (provided, state) => ({
    ...provided,
    borderColor: state.isFocused ? 'var(--color-blurple)' : 'var(--color-gray400)',
    boxShadow: state.isFocused ? '0 0 0 2px var(--color-blurple)' : 'none',
    minHeight: '40px',
    borderRadius: '0.5em',
    fontSize: '14px',
    margin: '0px 0px',
    padding: '0px 0px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    '&:hover': {
      borderColor: 'var(--color-blurple)',
    },
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected
      ? 'var(--color-blurple)'
      : state.isFocused
      ? 'var(--color-gray400)'
      : 'white',
    color: state.isSelected ? 'white' : 'var(--color-gray100)',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: 'var(--color-dk-blurple)',
      color: 'white',
    },
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'blue',
  }),
  input: (provided) => ({
    ...provided,
    color: 'green',
  }),
  menu: (provided, state) => {
    const menuAnchor = state.selectProps.menuAnchor || 'left';
    const baseStyles = {
      ...provided,
      minWidth: '250px',
      width: 'max-content',
      maxWidth: '400px',
    };

    if (menuAnchor === 'right') {
      return {
        ...baseStyles,
        right: 0,
        left: 'auto',
      };
    }

    return baseStyles;
  },
};

export function MultiValueContainer({children, ...props}) {
  return (
    <components.MultiValueContainer className="HEY" {...props}>
      <div className="MultiValueContainer">{children}</div>
    </components.MultiValueContainer>
  );
}

export function MultiValueLabel({children, ...props}) {
  return (
    <components.MultiValueLabel {...props}>
      <div className="MultiValueLabel">{children}</div>
    </components.MultiValueLabel>
  );
}

export function MultiValueRemove({children, ...props}) {
  return (
    <components.MultiValueRemove {...props}>
      <div className="MultiValueRemove">x</div>
    </components.MultiValueRemove>
  );
}
